from flask import Flask, request, jsonify, Response
from flask_cors import CORS, cross_origin
#from tika import parser as p
import os
import csv
import io
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
                                                        get_text_from_single_file, translate_text, TRANSLATION_API_KEY_REQUIRED_MESSAGE
from local_models import DEFAULT_CHAT_MODEL_TYPE, LOCAL_EMBEDDING_MODEL, get_fallback_chat_models, get_local_chat_models, resolve_chat_model


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


def is_translation_key_error(message):
    return isinstance(message, str) and message.startswith(f"[{TRANSLATION_API_KEY_REQUIRED_MESSAGE}]")


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


def serialize_model(model):
    return {
        **model,
        "installed": is_model_installed(model["tag"]),
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


def run_model_pull_async(model, ollama_path):
    command = [ollama_path, 'pull', model["tag"]]
    process_status = process_status_by_model[model["id"]]

    # Regular expression to match the time left message format
    time_left_regex = re.compile(r'\b\d+m\d+s\b')
    progress_regex = re.compile(r'(\d+)%')

    try:
        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        output_lines = []

        # Monitor the process output in real-time
        for line in iter(process.stdout.readline, ''):
            output_lines.append(line.strip())
            process_status["output"] = "\n".join(output_lines[-20:])
            match = time_left_regex.search(line)
            if match:
                process_status["time_left"] = match.group()

            match_progress = progress_regex.search(line)
            if match_progress:
                process_status["progress"] = int(match_progress.group(1))

        return_code = process.wait()  # Wait for the process to complete
        process_status["running"] = False
        process_status["completed"] = True
        process_status["time_left"] = ""

        if return_code == 0:
            process_status["error"] = ""
            process_status["progress"] = 100
        else:
            process_status["error"] = process_status["output"] or f"Ollama exited with status {return_code}."
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
        process_status["error"] = "Ollama CLI not found. Install Ollama or set OLLAMA_PATH to the executable."
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

        if chat_id is None:
            return json_error("chat_id is required.")

        messages = retrieve_message_from_db(chat_id, chat_type)

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
    except Exception as error:
        return json_error("Unable to export chat history.", status_code=500, details=str(error))

@app.route('/create-new-chat', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def create_new_chat():
    chat_type = payload_value('chat_type')
    model_type = payload_value('model_type')

    chat_id = add_chat_to_db(chat_type, model_type) #for now hardcode the model type as being 0

    return jsonify(chat_id=chat_id)


@app.route('/retrieve-all-chats', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def retrieve_chats():

    chat_info = retrieve_chats_from_db()

    return jsonify(chat_info=chat_info)


@app.route('/retrieve-messages-from-chat', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def retrieve_messages_from_chat():
    chat_type = payload_value('chat_type')
    chat_id = payload_value('chat_id')

    if chat_id is None:
        return json_error("chat_id is required.")

    messages = retrieve_message_from_db(chat_id, chat_type)

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

    update_chat_name_db(chat_id, chat_name)

    return json_success(message="Chat name updated")

@app.route('/delete-chat', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def delete_chat():
    chat_id = payload_value('chat_id')

    if chat_id is None:
        return json_error("chat_id is required.")

    return delete_chat_from_db(chat_id)

@app.route('/find-most-recent-chat', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def find_most_recent_chat():
    chat_info = find_most_recent_chat_from_db()

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

    for file in files:
        filename = file.filename or ""
        if not filename.lower().endswith(".pdf"):
            return json_error("Only PDF uploads are supported right now.")

        text = get_text_from_single_file(file)
        doc_id, doesExist = add_document_to_db(text, filename, chat_id=chat_id)
        if not doesExist:
            chunk_document(text, MAX_CHUNK_SIZE, doc_id)

    return json_success(status="success")

@app.route('/retrieve-current-docs', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def retrieve_current_docs():
    chat_id = payload_value('chat_id')

    if chat_id is None:
        return json_error("chat_id is required.")

    doc_info = retrieve_docs_from_db(chat_id)

    return jsonify(doc_info=doc_info)


@app.route('/delete-doc', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def delete_doc():
    doc_id = payload_value('doc_id')

    if doc_id is None:
        return json_error("doc_id is required.")

    delete_doc_from_db(doc_id)

    return json_success(message="Document deleted")

@app.route('/change-chat-mode', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def change_chat_mode_and_reset_chat():
    chat_mode_to_change_to = payload_value('model_type')
    chat_id = payload_value('chat_id')

    if chat_id is None:
        return json_error("chat_id is required.")

    try:
        reset_chat_db(chat_id)
        change_chat_mode_db(chat_mode_to_change_to, chat_id)

        return json_success(message="Chat mode updated")
    except Exception as error:
        return json_error("Unable to switch the local model for this chat.", status_code=500, details=str(error))

@app.route('/reset-chat', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def reset_chat():
    chat_id = payload_value('chat_id')

    if chat_id is None:
        return json_error("chat_id is required.")

    return reset_chat_db(chat_id)


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

    ##Include part where we verify if user actually owns the chat_id later

    query = message.strip()

    #This adds user message to db
    add_message_to_db(query, chat_id, 1)

    #Get most relevant section from the document
    sources = get_relevant_chunks(2, query, chat_id)
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
            import openai as _openai
            client = _openai.OpenAI(api_key=model_key)
            response = client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.3,
            )
            answer = response.choices[0].message.content.strip()
        except Exception as e:
            return json_error(f"OpenAI API error: {str(e)}", status_code=500)
    else:
        local_model = resolve_chat_model(model_type)
        try:
            response = ollama.chat(model=local_model["tag"], messages=[
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': user_prompt},
            ])
            answer = response['message']['content']
        except Exception:
            return json_error(f"Error with {local_model['label']}", status_code=500)

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

    add_model_key_to_db(model_key, chat_id)

    return json_success(message="Model key updated")


#Edgar
@app.route('/check-valid-ticker', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def check_valid_ticker():
   ticker = payload_value('ticker')

   if not ticker:
       return jsonify({'isValid': False})

   result = check_valid_api(ticker)
   return jsonify({'isValid': result})

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

    return add_ticker_to_chat_db(chat_id, ticker, isUpdate)


@app.route('/process-ticker-info', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def process_ticker_info():
    chat_id = payload_value('chat_id')
    ticker = payload_value('ticker')

    if chat_id is None:
        return json_error("chat_id is required.")

    if not ticker:
        return jsonify({"error": "Ticker is required."}), 400

    MAX_CHUNK_SIZE = 1000

    reset_uploaded_docs(chat_id)

    url, ticker = download_10K_url_ticker(ticker)
    filename = download_filing_as_pdf(url, ticker)

    text = get_text_from_single_file(filename)

    doc_id, doesExist = add_document_to_db(text, filename, chat_id)

    if not doesExist:
        chunk_document(text, MAX_CHUNK_SIZE, doc_id)

    if os.path.exists(filename):
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
            response = ollama.chat(model=model, messages=prompt_msg)
            chat_name = response['message']['content'].strip()[:60]
            break
        except Exception:
            continue

    if not chat_name:
        # Word-truncation fallback — use first 5 words of the conversation
        words = messages.strip().split()
        chat_name = ' '.join(words[:5]) or f'Chat {chat_id}'

    update_chat_name_db(chat_id, chat_name)
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
        if chat_id:
            user_message = f"[Translate to {target_language}] {text}"
            add_message_to_db(user_message, chat_id, 1)
            add_message_to_db(translation, chat_id, 0)

        return jsonify(translation=translation)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/reset-everything', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def reset_everything():
    return jsonify({"status": "reset"})


if __name__ == '__main__':
    app.run(port=5000)
