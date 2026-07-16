from flask import Flask, request, jsonify, Response
from flask_cors import CORS, cross_origin
#from tika import parser as p
import os
import csv
import io
from datetime import datetime
import ollama
import subprocess
import threading
import re
import uuid
import shutil


from api_endpoints.financeGPT.chatbot_endpoints import add_chat_to_db, retrieve_chats_from_db, retrieve_message_from_db, retrieve_docs_from_db, delete_doc_from_db, \
                                                        find_most_recent_chat_from_db, add_document_to_db, chunk_document, update_chat_name_db, delete_chat_from_db, \
                                                        reset_chat_db, change_chat_mode_db, add_message_to_db, get_relevant_chunks, add_sources_to_db, add_model_key_to_db, \
                                                        check_valid_api, reset_uploaded_docs, add_ticker_to_chat_db, download_10K_url_ticker, download_filing_as_pdf, \
                                                        get_text_from_single_file, translate_text, TRANSLATION_API_KEY_REQUIRED_MESSAGE, \
                                                        create_openai_client, close_openai_client, \
                                                        resolve_request_user_id, user_owns_chat, get_chat_details
from chat_export import build_markdown_export, build_html_export, sanitize_filename
from local_models import DEFAULT_CHAT_MODEL_TYPE, LOCAL_EMBEDDING_MODEL, get_fallback_chat_models, get_local_chat_models, get_ollama_options, resolve_chat_model


#load_dotenv()

app = Flask(__name__)

CORS(app, resources={r'/*': {'origins': '*'}}, supports_credentials=True)


def create_process_status():
    return {"running": False, "output": "", "error": "", "completed": False, "progress": 0, "time_left": ""}


process_status_by_model = {
    model["id"]: create_process_status()
    for model in get_local_chat_models()
}
LEGACY_MODEL_INSTALL_KEYS = {
    "llama2_exists": 0,
    "mistral_exists": 1,
}


def get_request_payload():
    return request.get_json(silent=True) or {}


def payload_value(key, default=None):
    return get_request_payload().get(key, default)


def json_success(status_code=200, **payload):
    return jsonify(payload), status_code


def json_error(message, status_code=400, **payload):
    return jsonify({"error": message, **payload}), status_code


def require_chat_ownership(chat_id, user_id):
    if user_owns_chat(chat_id, user_id):
        return None
    return json_error("Chat not found.", status_code=404)


def is_translation_key_error(message):
    return isinstance(message, str) and message.startswith(f"[{TRANSLATION_API_KEY_REQUIRED_MESSAGE}]")


def normalize_openai_error(error, missing_key_message=None):
    raw_message = str(error or "").strip()
    lowered_message = raw_message.lower()

    if "incorrect api key" in lowered_message or "invalid_api_key" in lowered_message:
        return (
            "The configured OpenAI API key is invalid. Update it in Settings or backend OPENAI_API_KEY and try again.",
            401,
        )

    if "api_key client option must be set" in lowered_message:
        return (
            missing_key_message
            or "An OpenAI API key is required before this request can use OpenAI.",
            400,
        )

    if "rate limit" in lowered_message:
        return (
            "OpenAI rate limits are currently preventing this request. Please wait a moment and try again.",
            429,
        )

    return raw_message or "OpenAI request failed.", 500


def get_ollama_manifest_path(model_tag):
    base_path = os.path.expanduser('~/.ollama/models/manifests/registry.ollama.ai/library')
    model_name, variant = (model_tag.split(':', 1) + [None])[:2]
    model_dir = os.path.join(base_path, model_name)
    if variant is None:
        return model_dir
    return os.path.join(model_dir, variant)


def is_model_installed(model_tag):
    model_path = get_ollama_manifest_path(model_tag)
    model_dir = os.path.dirname(model_path)
    return os.path.exists(model_path) or os.path.isdir(model_dir)


def local_runtime_required_message(feature_label="This feature"):
    return (
        f"{feature_label} requires Ollama plus the local embedding model "
        f"({LOCAL_EMBEDDING_MODEL}). Install a local model in Settings after installing Ollama, then try again."
    )


def is_local_embedding_ready():
    return is_model_installed(LOCAL_EMBEDDING_MODEL)


def ensure_local_embedding_ready(feature_label="This feature"):
    if is_local_embedding_ready():
        return None

    return json_error(
        local_runtime_required_message(feature_label),
        status_code=503,
        code="local_embedding_unavailable",
    )


def is_model_ready(model):
    return is_model_installed(model["tag"]) and is_local_embedding_ready()


def serialize_model(model):
    return {
        **model,
        "installed": is_model_ready(model),
        "chat_model_installed": is_model_installed(model["tag"]),
    }


def get_model_status(model_type):
    model = resolve_chat_model(model_type)
    return process_status_by_model[model["id"]]


def resolve_ollama_binary():
    configured_path = os.getenv("OLLAMA_PATH")
    if configured_path:
        if os.path.isabs(configured_path):
            return configured_path if os.path.exists(configured_path) else None

        resolved_path = shutil.which(configured_path)
        if resolved_path:
            return resolved_path

    return shutil.which("ollama")


def get_requested_model_type():
    return get_request_payload().get("model_type", DEFAULT_CHAT_MODEL_TYPE)


def build_local_models_response(include_legacy_keys=False):
    models = [serialize_model(model) for model in get_local_chat_models()]
    response = {
        "models": models,
        "default_model_type": DEFAULT_CHAT_MODEL_TYPE,
        "embedding_model": LOCAL_EMBEDDING_MODEL,
        "embedding_model_installed": is_model_installed(LOCAL_EMBEDDING_MODEL),
    }

    if include_legacy_keys:
        for response_key, index in LEGACY_MODEL_INSTALL_KEYS.items():
            response[response_key] = models[index]["installed"] if len(models) > index else False

    return response

@app.before_request
def before_request():
    if request.method == 'OPTIONS':
        response = app.make_default_options_response()
        headers = None
        if 'Access-Control-Request-Headers' in request.headers:
            headers = request.headers['Access-Control-Request-Headers']

        h = response.headers
        h['Access-Control-Allow-Origin'] = request.headers.get('Origin', '*')
        h['Access-Control-Allow-Methods'] = 'POST, GET, OPTIONS, DELETE'
        h['Access-Control-Allow-Headers'] = headers or 'Authorization, Content-Type' #'Authorization'
        h['Access-Control-Allow-Credentials'] = 'true'
        return response

@app.after_request
def after_request(response):
    response.headers['Access-Control-Allow-Origin'] = request.headers.get('Origin', '*')
    response.headers['Access-Control-Allow-Credentials'] = 'true'
    return response

@app.route('/test-flask', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def test_flask():
    return jsonify(test="hello world")

#INSTALLATION
@app.route('/local-models', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def local_models():
    return jsonify(build_local_models_response())


@app.route('/check-models', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def check_models():
    return jsonify(build_local_models_response(include_legacy_keys=True))


def stream_model_pull(command, process_status, progress_offset, progress_weight, label):
    time_left_regex = re.compile(r'\b\d+m\d+s\b')
    progress_regex = re.compile(r'(\d+)%')

    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    output_lines = []

    for line in iter(process.stdout.readline, ''):
        stripped_line = line.strip()
        if stripped_line:
            output_lines.append(f"[{label}] {stripped_line}")
            process_status["output"] = "\n".join(output_lines[-20:])

        match = time_left_regex.search(line)
        if match:
            process_status["time_left"] = f"{label}: {match.group()}"

        match_progress = progress_regex.search(line)
        if match_progress:
            stage_progress = int(match_progress.group(1))
            total_progress = progress_offset + (stage_progress * progress_weight / 100)
            process_status["progress"] = min(99, int(total_progress))

    return process.wait()


def run_model_pull_async(model, ollama_path):
    process_status = process_status_by_model[model["id"]]
    install_targets = []

    if not is_model_installed(model["tag"]):
        install_targets.append(model)

    if LOCAL_EMBEDDING_MODEL != model["tag"] and not is_model_installed(LOCAL_EMBEDDING_MODEL):
        install_targets.append({
            "tag": LOCAL_EMBEDDING_MODEL,
            "label": f"{LOCAL_EMBEDDING_MODEL} embeddings",
        })

    try:
        if not install_targets:
            process_status["running"] = False
            process_status["completed"] = True
            process_status["time_left"] = ""
            process_status["error"] = ""
            process_status["progress"] = 100
            return

        stage_count = len(install_targets)
        for stage_index, install_target in enumerate(install_targets):
            progress_offset = int(100 * stage_index / stage_count)
            progress_weight = 100 / stage_count
            return_code = stream_model_pull(
                [ollama_path, 'pull', install_target["tag"]],
                process_status,
                progress_offset,
                progress_weight,
                install_target["label"],
            )

            if return_code != 0:
                process_status["running"] = False
                process_status["completed"] = True
                process_status["time_left"] = ""
                process_status["error"] = (
                    process_status["output"] or f"Ollama exited with status {return_code}."
                )
                return

        process_status["running"] = False
        process_status["completed"] = True
        process_status["time_left"] = ""
        process_status["error"] = ""
        process_status["progress"] = 100
    except Exception as e:
        process_status["running"] = False
        process_status["completed"] = True
        process_status["time_left"] = ""
        process_status["error"] = str(e)


def start_model_install(model_type):
    model = resolve_chat_model(model_type)
    process_status = process_status_by_model[model["id"]]
    serialized_model = serialize_model(model)
    ollama_path = resolve_ollama_binary()

    if process_status["running"]:
        return jsonify({"success": False, "message": f"{model['label']} is already downloading."})

    if serialized_model["installed"]:
        process_status.update(create_process_status())
        process_status["completed"] = True
        process_status["progress"] = 100
        return jsonify({
            "success": True,
            "already_installed": True,
            "message": f"{model['label']} is already installed.",
            "model": serialized_model,
        })

    if not ollama_path:
        process_status.update(create_process_status())
        process_status["completed"] = True
        process_status["error"] = (
            "Ollama CLI not found. Local model downloads run on your machine, so install Ollama "
            "or set OLLAMA_PATH to the executable first."
        )
        return jsonify({
            "success": False,
            "message": process_status["error"],
            "model": serialized_model,
        }), 400

    process_status.update(create_process_status())
    process_status["running"] = True
    threading.Thread(target=run_model_pull_async, args=(model, ollama_path), daemon=True).start()
    return jsonify({"success": True, "message": f"{model['label']} pull initiated.", "model": serialized_model})


def get_model_status_response(model_type):
    model = resolve_chat_model(model_type)
    return jsonify({**process_status_by_model[model["id"]], "model": serialize_model(model)})

@app.route('/install-llama', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def run_llama():
    return start_model_install(0)

@app.route('/install-mistral', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def run_mistral():
    return start_model_install(1)


@app.route('/install-local-model', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def install_local_model():
    return start_model_install(get_requested_model_type())


@app.route('/llama-status', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def llama_status():
    return get_model_status_response(0)

@app.route('/mistral-status', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def mistral_status():
    return get_model_status_response(1)


@app.route('/local-model-status', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def local_model_status():
    return get_model_status_response(get_requested_model_type())

@app.route('/download-chat-history', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def download_chat_history():
    try:
        chat_type = payload_value('chat_type')
        chat_id = payload_value('chat_id')
        export_format = (payload_value('format') or 'csv').lower()

        if chat_id is None:
            return json_error("chat_id is required.")

        if export_format not in ('csv', 'md', 'html'):
            return json_error("format must be one of: csv, md, html.")

        user_id = resolve_request_user_id()
        chat = get_chat_details(chat_id, user_id)
        if chat is None:
            return json_error("Chat not found.", status_code=404)

        messages = retrieve_message_from_db(chat_id, chat_type, user_id)

        if export_format == 'csv':
            paired_messages = []
            for i in range(len(messages) - 1):
                if messages[i]['sent_from_user'] == 1 and messages[i+1]['sent_from_user'] == 0:
                    paired_messages.append((messages[i]['message_text'], messages[i+1]['message_text']))

            csv_buffer = io.StringIO()
            writer = csv.writer(csv_buffer)
            writer.writerow(['Query', 'Response'])
            writer.writerows(paired_messages)

            response = Response(csv_buffer.getvalue(), mimetype='text/csv')
            response.headers['Content-Disposition'] = f'attachment; filename=chat-history-{chat_id}.csv'
            return response

        exported_at = datetime.now().strftime('%B %d, %Y at %H:%M')
        document_names = [doc['document_name'] for doc in retrieve_docs_from_db(chat_id, user_id)]
        base_name = sanitize_filename(chat['chat_name'], fallback=f'chat-{chat_id}')

        if export_format == 'md':
            body = build_markdown_export(chat['chat_name'], chat['ticker'], document_names, messages, exported_at)
            response = Response(body, mimetype='text/markdown; charset=utf-8')
            response.headers['Content-Disposition'] = f'attachment; filename={base_name}.md'
            return response

        body = build_html_export(chat['chat_name'], chat['ticker'], document_names, messages, exported_at)
        return Response(body, mimetype='text/html; charset=utf-8')
    except Exception as error:
        return json_error("Unable to export chat history.", status_code=500, details=str(error))

@app.route('/create-new-chat', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def create_new_chat():
    chat_type = payload_value('chat_type')
    model_type = payload_value('model_type')

    chat_id, chat_name = add_chat_to_db(chat_type, model_type, resolve_request_user_id())

    return jsonify(chat_id=chat_id, chat_name=chat_name)


@app.route('/retrieve-all-chats', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def retrieve_chats():

    chat_info = retrieve_chats_from_db(resolve_request_user_id())

    return jsonify(chat_info=chat_info)


@app.route('/retrieve-messages-from-chat', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def retrieve_messages_from_chat():
    chat_type = payload_value('chat_type')
    chat_id = payload_value('chat_id')

    if chat_id is None:
        return json_error("chat_id is required.")

    messages = retrieve_message_from_db(chat_id, chat_type, resolve_request_user_id())

    return jsonify(messages=messages)

@app.route('/update-chat-name', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def update_chat_name():
    chat_name = payload_value('chat_name')
    chat_id = payload_value('chat_id')

    if chat_id is None:
        return json_error("chat_id is required.")

    if chat_name is None:
        return json_error("chat_name is required.")

    update_chat_name_db(chat_id, chat_name, resolve_request_user_id())

    return json_success(message="Chat name updated")

@app.route('/delete-chat', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def delete_chat():
    chat_id = payload_value('chat_id')

    if chat_id is None:
        return json_error("chat_id is required.")

    return delete_chat_from_db(chat_id, resolve_request_user_id())

@app.route('/find-most-recent-chat', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def find_most_recent_chat():
    chat_info = find_most_recent_chat_from_db(resolve_request_user_id())

    return jsonify(chat_info=chat_info)

@app.route('/ingest-metadata', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def ingest_metadata():
    chat_id = payload_value('chat_id')

    if chat_id is None:
        return json_error("chat_id is required.")
    
    upload_token = str(uuid.uuid4())  # Generate a unique token for the upload URL
    upload_url = f"ingest-files/{chat_id}/{upload_token}"
        
    return jsonify({"uploadUrl": upload_url})

@app.route('/ingest-files/<chat_id>/<upload_token>', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def ingest_files(chat_id, upload_token):
    files = request.files.getlist('files[]')
    MAX_CHUNK_SIZE = 1000

    if not files:
        return json_error("At least one PDF file is required.")

    ownership_error = require_chat_ownership(chat_id, resolve_request_user_id())
    if ownership_error:
        return ownership_error

    embedding_ready_error = ensure_local_embedding_ready("Document upload")
    if embedding_ready_error:
        return embedding_ready_error

    try:
        for file in files:
            filename = file.filename or ""
            if not filename.lower().endswith(".pdf"):
                return json_error("Only PDF uploads are supported right now.")

            text = get_text_from_single_file(file)
            doc_id, doesExist = add_document_to_db(text, filename, chat_id=chat_id)
            if not doesExist:
                chunk_document(text, MAX_CHUNK_SIZE, doc_id)
    except Exception as error:
        return json_error(
            "Unable to index the uploaded PDF. Please verify Ollama is installed and running, then try again.",
            status_code=500,
            details=str(error),
        )

    return json_success(status="success")

@app.route('/retrieve-current-docs', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def retrieve_current_docs():
    chat_id = payload_value('chat_id')

    if chat_id is None:
        return json_error("chat_id is required.")

    doc_info = retrieve_docs_from_db(chat_id, resolve_request_user_id())

    return jsonify(doc_info=doc_info)


@app.route('/delete-doc', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def delete_doc():
    doc_id = payload_value('doc_id')

    if doc_id is None:
        return json_error("doc_id is required.")

    delete_doc_from_db(doc_id, resolve_request_user_id())

    return json_success(message="Document deleted")

@app.route('/change-chat-mode', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def change_chat_mode_and_reset_chat():
    chat_mode_to_change_to = payload_value('model_type')
    chat_id = payload_value('chat_id')

    if chat_id is None:
        return json_error("chat_id is required.")

    try:
        user_id = resolve_request_user_id()
        reset_chat_db(chat_id, user_id)
        change_chat_mode_db(chat_mode_to_change_to, chat_id, user_id)

        return json_success(message="Chat mode updated")
    except Exception as error:
        return json_error("Unable to switch the local model for this chat.", status_code=500, details=str(error))

@app.route('/reset-chat', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def reset_chat():
    chat_id = payload_value('chat_id')

    if chat_id is None:
        return json_error("chat_id is required.")

    return reset_chat_db(chat_id, resolve_request_user_id())


@app.route('/process-message-pdf', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def process_message_pdf():
    message = payload_value('message')
    chat_id = payload_value('chat_id')
    model_type = payload_value('model_type')
    model_key = payload_value('model_key')

    if chat_id is None:
        return json_error("chat_id is required.")

    if not message or not str(message).strip():
        return json_error("message is required.")

    user_id = resolve_request_user_id()
    ownership_error = require_chat_ownership(chat_id, user_id)
    if ownership_error:
        return ownership_error

    query = message.strip()

    #This adds user message to db
    add_message_to_db(query, chat_id, 1)

    #Get most relevant section from the document
    sources = get_relevant_chunks(2, query, chat_id, user_id)
    sources_str = " ".join([", ".join(str(elem) for elem in source) for source in sources])

    system_prompt = (
        "You are an expert financial analyst AI assistant. Answer the user's question based on the provided document sources. "
        "Be thorough, structured, and use markdown formatting (headers, bullet points, tables) where appropriate. "
        "If the answer cannot be found in the provided sources, clearly state that. "
        "Cite specific details from the documents to support your answer."
    )
    user_prompt = f"Document sources:\n{sources_str}\n\nQuestion: {query}"

    if model_key:
        # Use custom OpenAI API key
        try:
            client = create_openai_client(model_key)
            try:
                response = client.chat.completions.create(
                    model="gpt-3.5-turbo",
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=0.3,
                )
                answer = response.choices[0].message.content.strip()
            finally:
                close_openai_client(client)
        except Exception as e:
            error_message, status_code = normalize_openai_error(e)
            return json_error(error_message, status_code=status_code)
    else:
        local_model = resolve_chat_model(model_type)
        try:
            response = ollama.chat(model=local_model["tag"], messages=[
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': user_prompt},
            ], options=get_ollama_options())
            answer = response['message']['content']
        except Exception as e:
            return json_error(f"Error with {local_model['label']}: {e}", status_code=500)

    #This adds bot message
    message_id = add_message_to_db(answer, chat_id, 0)
    
    try:
        add_sources_to_db(message_id, sources)
    except Exception:
        pass

    return jsonify(answer=answer)

@app.route('/add-model-key', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def add_model_key():
    model_key = payload_value('model_key')
    chat_id = payload_value('chat_id')

    if chat_id is None:
        return json_error("chat_id is required.")

    add_model_key_to_db(model_key, chat_id, resolve_request_user_id())

    return json_success(message="Model key updated")


#Edgar
@app.route('/check-valid-ticker', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def check_valid_ticker():
   ticker = payload_value('ticker')

   if not ticker:
       return jsonify({'isValid': False})

   try:
       result = check_valid_api(ticker)
       return jsonify({'isValid': result})
   except Exception as error:
       return jsonify({'isValid': False, 'error': str(error)}), 503

@app.route('/add-ticker-to-chat', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def add_ticker():
    ticker = payload_value('ticker')
    chat_id = payload_value('chat_id')
    isUpdate = payload_value('isUpdate')

    if chat_id is None:
        return json_error("chat_id is required.")

    if not ticker:
        return json_error("ticker is required.")

    return add_ticker_to_chat_db(chat_id, ticker, isUpdate, resolve_request_user_id())


@app.route('/process-ticker-info', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def process_ticker_info():
    chat_id = payload_value('chat_id')
    ticker = payload_value('ticker')

    if chat_id is None:
        return json_error("chat_id is required.")

    if not ticker:
        return jsonify({"error": "Ticker is required."}), 400

    user_id = resolve_request_user_id()
    ownership_error = require_chat_ownership(chat_id, user_id)
    if ownership_error:
        return ownership_error

    embedding_ready_error = ensure_local_embedding_ready("Ticker analysis")
    if embedding_ready_error:
        return embedding_ready_error

    MAX_CHUNK_SIZE = 1000
    filename = None

    try:
        reset_uploaded_docs(chat_id, user_id)

        url, ticker = download_10K_url_ticker(ticker)
        if not url or not ticker:
            return json_error("We couldn't find a recent 10-K filing for that ticker.", status_code=404)

        filename = download_filing_as_pdf(url, ticker)
        text = get_text_from_single_file(filename)

        doc_id, doesExist = add_document_to_db(text, filename, chat_id)

        if not doesExist:
            chunk_document(text, MAX_CHUNK_SIZE, doc_id)

        if os.path.exists(filename):
            os.remove(filename)
    except Exception as error:
        return json_error(
            "Unable to prepare this 10-K filing right now. Please verify Ollama is installed and running, then try again.",
            status_code=500,
            details=str(error),
        )
    finally:
        if filename and os.path.exists(filename):
            os.remove(filename)

    return jsonify({"status": "success"}), 200

@app.route('/infer-chat-name', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def infer_chat_name():
    messages = payload_value('messages', '')
    chat_id = payload_value('chat_id')
    model_type = payload_value('model_type', DEFAULT_CHAT_MODEL_TYPE)

    if chat_id is None:
        return json_error("chat_id is required.")

    prompt_msg = [{
        'role': 'user',
        'content': f'Generate a short 3-5 word chat title for this conversation snippet. Reply with only the title, no punctuation or quotes:\n\n{messages[:500]}'
    }]

    # Try preferred model first, then the remaining local models, then word-truncation fallback
    models_to_try = [model["tag"] for model in get_fallback_chat_models(model_type)]
    chat_name = None

    for model in models_to_try:
        try:
            response = ollama.chat(model=model, messages=prompt_msg, options=get_ollama_options())
            chat_name = response['message']['content'].strip()[:60]
            break
        except Exception:
            continue

    if not chat_name:
        # Word-truncation fallback — use first 5 words of the conversation
        words = messages.strip().split()
        chat_name = ' '.join(words[:5]) or f'Chat {chat_id}'

    update_chat_name_db(chat_id, chat_name, resolve_request_user_id())
    return jsonify(chat_name=chat_name)


@app.route('/translate-text', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def translate_text_endpoint():
    text = payload_value('text', '')
    source_language = payload_value('source_language', 'Auto-detect')
    target_language = payload_value('target_language', 'Spanish')
    model_key = payload_value('model_key', '')
    chat_id = payload_value('chat_id')

    if not text.strip():
        return jsonify({"error": "No text provided"}), 400

    try:
        translation = translate_text(text, source_language, target_language, model_key or None)

        if is_translation_key_error(translation):
            return json_error(
                f"{TRANSLATION_API_KEY_REQUIRED_MESSAGE} You can also configure OPENAI_API_KEY on the backend.",
                status_code=400,
            )

        # Persist to DB if we have a chat_id
        if chat_id and user_owns_chat(chat_id, resolve_request_user_id()):
            user_message = f"[Translate to {target_language}] {text}"
            add_message_to_db(user_message, chat_id, 1)
            add_message_to_db(translation, chat_id, 0)

        return jsonify(translation=translation)
    except Exception as e:
        error_message, status_code = normalize_openai_error(
            e,
            missing_key_message=(
                f"{TRANSLATION_API_KEY_REQUIRED_MESSAGE} You can also configure OPENAI_API_KEY on the backend."
            ),
        )
        return jsonify({"error": error_message}), status_code


@app.route('/reset-everything', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def reset_everything():
    return jsonify({"status": "reset"})


if __name__ == '__main__':
    app.run(port=5000)
