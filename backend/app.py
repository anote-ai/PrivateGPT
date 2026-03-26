from flask import Flask, request, jsonify, abort, redirect, send_file
from flask_cors import CORS, cross_origin
from dotenv import load_dotenv
#from tika import parser as p
import openai
import os
import csv
import ollama
import subprocess
import threading
import re
import PyPDF2
import uuid


from api_endpoints.financeGPT.chatbot_endpoints import add_chat_to_db, retrieve_chats_from_db, retrieve_message_from_db, retrieve_docs_from_db, delete_doc_from_db, \
                                                        find_most_recent_chat_from_db, add_document_to_db, chunk_document, update_chat_name_db, delete_chat_from_db, \
                                                        reset_chat_db, change_chat_mode_db, add_message_to_db, get_relevant_chunks, add_sources_to_db, add_model_key_to_db, \
                                                        check_valid_api, reset_uploaded_docs, add_ticker_to_chat_db, download_10K_url_ticker, download_filing_as_pdf, \
                                                        get_text_from_single_file, translate_text


#load_dotenv()

app = Flask(__name__)
# TODO: Replace with your URLs.
config = {
  'ORIGINS': [
    'http://localhost:3000',  # React
    'http://dashboard.localhost:3000',  # React
  ],
}
#CORS(app, resources={ r'/*': {'origins': config['ORIGINS']}}, supports_credentials=True)

CORS(app, resources={r'/*': {'origins': '*'}}, supports_credentials=True)

process_status_llama = {"running": False, "output": "", "error": ""}
process_status_mistral = {"running": False, "output": "", "error": ""}

@app.before_request
def before_request():
    if request.method == 'OPTIONS':
        response = app.make_default_options_response()
        headers = None
        if 'Access-Control-Request-Headers' in request.headers:
            headers = request.headers['Access-Control-Request-Headers']

        h = response.headers
        h['Access-Control-Allow-Origin'] = request.headers['Origin']
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
    print("hello world")
    test = "hello world"
    return jsonify(test=test)

#INSTALLATION
@app.route('/check-models', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def check_models():
    base_path = os.path.expanduser('~/.ollama/models/manifests/registry.ollama.ai/library')
    llama2_exists = os.path.isdir(os.path.join(base_path, 'llama2'))
    mistral_exists = os.path.isdir(os.path.join(base_path, 'mistral'))
    print("llama and mistral", llama2_exists, mistral_exists)
    return jsonify({'llama2_exists': llama2_exists, 'mistral_exists': mistral_exists})

def run_llama_async():
    ollama_path = '/usr/local/bin/ollama'
    # For Windows
    # ollama_path = os.path.join(os.getenv('LOCALAPPDATA'), 'Programs', 'Ollama', 'ollama.exe')
    command = [ollama_path, 'run', 'llama2']
    
    # Regular expression to match the time left message format
    time_left_regex = re.compile(r'\b\d+m\d+s\b')
    progress_regex = re.compile(r'(\d+)%')

    try:
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        
        # Monitor the process output in real-time
        for line in iter(process.stderr.readline, ''):
            print(line, end='')  # Debug: print each line to server log
            match = time_left_regex.search(line)
            if match:
                process_status_llama["time_left"] = match.group()
                
            match_progress = progress_regex.search(line)
            if match_progress:
                process_status_llama["progress"] = int(match_progress.group(1))
        
        process.wait()  # Wait for the process to complete
        process_status_llama["running"] = False
        process_status_llama["completed"] = True
        process_status_llama["progress"] = 100
        print("process complete")
    except Exception as e:
        process_status_llama["running"] = False
        process_status_llama["completed"] = True
        process_status_llama["error"] = str(e)
        
def run_mistral_async():
    ollama_path = '/usr/local/bin/ollama'
    # For Windows
    # ollama_path = os.path.join(os.getenv('LOCALAPPDATA'), 'Programs', 'Ollama', 'ollama.exe')
    command = [ollama_path, 'run', 'mistral']
    
    # Regular expression to match the time left message format
    time_left_regex = re.compile(r'\b\d+m\d+s\b')
    progress_regex = re.compile(r'(\d+)%')

    try:
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        # For Windows
        # process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, shell=True)
        
        # Monitor the process output in real-time
        for line in iter(process.stderr.readline, ''):
            print(line, end='')  # Debug: print each line to server log
            match = time_left_regex.search(line)
            if match:
                process_status_mistral["time_left"] = match.group()
                
            match_progress = progress_regex.search(line)
            if match_progress:
                process_status_mistral["progress"] = int(match_progress.group(1))
        
        process.wait()  # Wait for the process to complete
        print("process complete")
        process_status_mistral["running"] = False
        process_status_mistral["completed"] = True
        process_status_mistral["progress"] = 100
    except Exception as e:
        process_status_mistral["running"] = False
        process_status_mistral["completed"] = True
        process_status_mistral["error"] = str(e)
        

@app.route('/install-llama', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def run_llama():
    if not process_status_llama["running"]:
        process_status_llama["running"] = True
        process_status_llama["completed"] = False
        threading.Thread(target=run_llama_async()).start()
        return jsonify({"success": True, "message": "Ollama run initiated."})
    else:
        return jsonify({"success": False, "message": "Ollama run is already in progress."})
        
@app.route('/install-mistral', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def run_mistral():
    if not process_status_mistral["running"]:
        process_status_mistral["running"] = True
        process_status_mistral["completed"] = False
        threading.Thread(target=run_mistral_async).start()
        return jsonify({"success": True, "message": "Mistral run initiated."})
    else:
        return jsonify({"success": False, "message": "Ollama run is already in progress."})
@app.route('/llama-status', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def llama_status():
    return jsonify(process_status_llama)

@app.route('/mistral-status', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def mistral_status():
    return jsonify(process_status_mistral)

@app.route('/download-chat-history', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def download_chat_history():
    try:
        chat_type = request.json.get('chat_type')
        chat_id = request.json.get('chat_id')

        messages = retrieve_message_from_db(chat_id, chat_type)

        paired_messages = []
        for i in range(len(messages) - 1):
            if messages[i]['sent_from_user'] == 1 and messages[i+1]['sent_from_user'] == 0:
                paired_messages.append((messages[i]['message_text'], messages[i+1]['message_text']))

        output_directory = 'output_document'
        if not os.path.exists(output_directory):
            os.makedirs(output_directory)

        file_path = os.path.join(output_directory, 'chat_history.csv')

        with open(file_path, 'w', newline='', encoding='utf-8') as file:
            writer = csv.writer(file)
            writer.writerow(['Query', 'Response'])  # Header
            writer.writerows(paired_messages)

        return "success"
    except:
        return "error"

@app.route('/create-new-chat', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def create_new_chat():

    chat_type = request.json.get('chat_type')
    model_type = request.json.get('model_type')

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

    chat_type = request.json.get('chat_type')
    chat_id = request.json.get('chat_id')

    messages = retrieve_message_from_db(chat_id, chat_type)

    return jsonify(messages=messages)

@app.route('/update-chat-name', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def update_chat_name():

    chat_name = request.json.get('chat_name')
    chat_id = request.json.get('chat_id')

    update_chat_name_db(chat_id, chat_name)

    return "Chat name updated"

@app.route('/delete-chat', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def delete_chat():
    chat_id = request.json.get('chat_id')
    print("chat is", chat_id)

    return delete_chat_from_db(chat_id)

@app.route('/find-most-recent-chat', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def find_most_recent_chat():
    chat_info = find_most_recent_chat_from_db()

    return jsonify(chat_info=chat_info)

@app.route('/ingest-metadata', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def ingest_metadata():
    data = request.json
    chat_id = data.get('chat_id')
    print("Received chat_id:", chat_id)
    
    upload_token = str(uuid.uuid4())  # Generate a unique token for the upload URL
    upload_url = f"ingest-files/{chat_id}/{upload_token}"
        
    return jsonify({"uploadUrl": upload_url})

@app.route('/ingest-files/<chat_id>/<upload_token>', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def ingest_files(chat_id, upload_token):
    files = request.files.getlist('files[]')
    MAX_CHUNK_SIZE = 1000

    for file in files:
        text = get_text_from_single_file(file)
        filename = file.filename
        doc_id, doesExist = add_document_to_db(text, filename, chat_id=chat_id)
        if not doesExist:
            chunk_document(text, MAX_CHUNK_SIZE, doc_id)

    return jsonify({"status": "success"})

@app.route('/retrieve-current-docs', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def retrieve_current_docs():
    chat_id = request.json.get('chat_id')

    doc_info = retrieve_docs_from_db(chat_id)

    return jsonify(doc_info=doc_info)


@app.route('/delete-doc', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def delete_doc():
    doc_id = request.json.get('doc_id')

    delete_doc_from_db(doc_id)

    return "success"

@app.route('/change-chat-mode', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def change_chat_mode_and_reset_chat():
    chat_mode_to_change_to = request.json.get('model_type')
    chat_id = request.json.get('chat_id')

    try:
        reset_chat_db(chat_id)
        change_chat_mode_db(chat_mode_to_change_to, chat_id)

        return "Success"
    except:
        return "Error"

@app.route('/reset-chat', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def reset_chat():
    chat_id = request.json.get('chat_id')

    return reset_chat_db(chat_id)


@app.route('/process-message-pdf', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def process_message_pdf():
    message = request.json.get('message')
    chat_id = request.json.get('chat_id')
    model_type = request.json.get('model_type')
    model_key = request.json.get('model_key')

    ##Include part where we verify if user actually owns the chat_id later

    query = message.strip()

    #This adds user message to db
    add_message_to_db(query, chat_id, 1)

    #Get most relevant section from the document
    sources = get_relevant_chunks(2, query, chat_id)
    sources_str = " ".join([", ".join(str(elem) for elem in source) for source in sources])
    print("sources_str", sources_str)

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
            return jsonify({"error": f"OpenAI API error: {str(e)}"}), 500
    elif model_type == 0:
        try:
            response = ollama.chat(model='llama2', messages=[
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': user_prompt},
            ])
            answer = response['message']['content']
        except Exception as e:
            return jsonify({"error": "Error with llama2"}), 500
    else:
        try:
            response = ollama.chat(model='mistral', messages=[
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': user_prompt},
            ])
            answer = response['message']['content']
        except Exception as e:
            return jsonify({"error": "Error with Mistral"}), 500

    #This adds bot message
    message_id = add_message_to_db(answer, chat_id, 0)
    
    try:
        add_sources_to_db(message_id, sources)
    except:
        print("error adding sources to db or no sources")

    return jsonify(answer=answer)

@app.route('/add-model-key', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def add_model_key():
    model_key = request.json.get('model_key')
    chat_id = request.json.get('chat_id')

    add_model_key_to_db(model_key, chat_id)

    return "success"


#Edgar
@app.route('/check-valid-ticker', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def check_valid_ticker():
   ticker = request.json.get('ticker')
   result = check_valid_api(ticker)
   return jsonify({'isValid': result})

@app.route('/add-ticker-to-chat', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def add_ticker():

    ticker = request.json.get('ticker')
    chat_id = request.json.get('chat_id')
    isUpdate = request.json.get('isUpdate')

    return add_ticker_to_chat_db(chat_id, ticker, isUpdate)


@app.route('/process-ticker-info', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def process_ticker_info():
    chat_id = request.json.get('chat_id')
    ticker = request.json.get('ticker')

    if ticker:
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
            print(f"File '{filename}' has been deleted.")
        else:
            print(f"The file '{filename}' does not exist.")


    return jsonify({"error": "Invalid JWT"}), 200

@app.route('/infer-chat-name', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def infer_chat_name():
    messages = request.json.get('messages', '')
    chat_id = request.json.get('chat_id')

    try:
        response = ollama.chat(model='mistral', messages=[
            {
                'role': 'user',
                'content': f'Generate a short 3-5 word chat title for this conversation snippet. Reply with only the title, no punctuation or quotes:\n\n{messages[:500]}'
            },
        ])
        chat_name = response['message']['content'].strip()[:60]
    except Exception:
        chat_name = f"Chat {chat_id}"

    update_chat_name_db(chat_id, chat_name)
    return jsonify(chat_name=chat_name)


@app.route('/translate-text', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def translate_text_endpoint():
    text = request.json.get('text', '')
    source_language = request.json.get('source_language', 'Auto-detect')
    target_language = request.json.get('target_language', 'Spanish')
    model_key = request.json.get('model_key', '')

    if not text.strip():
        return jsonify({"error": "No text provided"}), 400

    try:
        translation = translate_text(text, source_language, target_language, model_key or None)
        return jsonify(translation=translation)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/reset-everything', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def reset_everything():
    return jsonify({"status": "reset"})


if __name__ == '__main__':
    app.run(port=5000)
