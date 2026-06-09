from flask import Flask, request, jsonify, abort, redirect, send_file
from flask_cors import CORS, cross_origin
from dotenv import load_dotenv
#from tika import parser as p
import os
import csv
import json
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
                                                        get_text_from_single_file


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

process_status_llama = {"running": False, "output": "", "error": "", "progress": 0, "time_left": ""}
process_status_mistral = {"running": False, "output": "", "error": "", "progress": 0, "time_left": ""}

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
        process_status_llama["error"] = ""
        process_status_llama["progress"] = 0
        process_status_llama["time_left"] = ""
        threading.Thread(target=run_llama_async).start()
        return jsonify({"success": True, "message": "Ollama run initiated."})
    else:
        return jsonify({"success": False, "message": "Ollama run is already in progress."})
        
@app.route('/install-mistral', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def run_mistral():
    if not process_status_mistral["running"]:
        process_status_mistral["running"] = True
        process_status_mistral["completed"] = False
        process_status_mistral["error"] = ""
        process_status_mistral["progress"] = 0
        process_status_mistral["time_left"] = ""
        threading.Thread(target=run_mistral_async).start()
        return jsonify({"success": True, "message": "Mistral run initiated."})
    else:
        return jsonify({"success": False, "message": "Ollama run is already in progress."})
# @app.route('/install-llama-and-mistral', methods=['POST'])
# def run_ollama():
#     try:
        
#         # Running the command 'ollama run llama2'
#         ollama_path = '/usr/local/bin/ollama'
#         print("running ollama run llama2")
#         result = subprocess.run([ollama_path, 'run', 'llama2'], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
#         print("running ollama run mistral")
#         result = subprocess.run([ollama_path, 'run', 'mistral'], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
#         # Return the standard output if the command was successful
#         return jsonify({"success": True, "message": "Ollama run successfully.", "output": result.stdout})
#     except subprocess.CalledProcessError as e:
#         # Return error message if the command failed
#         print(f"Ollama command failed with error: {e.stderr}")
#         print("test1")
#         return jsonify({"success": False, "message": "Failed to run Ollama.", "error": e.stderr}), 500
    
@app.route('/llama-status', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def llama_status():
    return jsonify(process_status_llama)

@app.route('/mistral-status', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def mistral_status():
    return jsonify(process_status_mistral)
    
""" @app.route('/install-mistral', methods=['POST'])
def run_mistral():
    try:
        print("test2")
        # Running the command 'ollama run llama2'
        result = subprocess.run(['ollama', 'run', 'mistral'], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        
        # Return the standard output if the command was successful
        return jsonify({"success": True, "message": "Ollama run successfully.", "output": result.stdout})
    except subprocess.CalledProcessError as e:
        # Return error message if the command failed
        print(f"Ollama command failed with error: {e.stderr}")
        print("test1")
        return jsonify({"success": False, "message": "Failed to run Ollama.", "error": e.stderr}), 500 """

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
    except Exception as e:
        print("Error downloading chat history:", e)
        return "error", 500


@app.route('/download-finetune-history', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def download_finetune_history():
    try:
        chat_type = request.json.get('chat_type')
        chat_id = request.json.get('chat_id')

        messages = retrieve_message_from_db(chat_id, chat_type)

        output_directory = 'output_document'
        if not os.path.exists(output_directory):
            os.makedirs(output_directory)

        file_path = os.path.join(output_directory, 'finetune_chat_history.jsonl')

        examples_written = 0
        with open(file_path, 'w', encoding='utf-8') as file:
            for i in range(len(messages) - 1):
                if messages[i]['sent_from_user'] == 1 and messages[i + 1]['sent_from_user'] == 0:
                    record = {
                        "messages": [
                            {"role": "user", "content": messages[i]['message_text']},
                            {"role": "assistant", "content": messages[i + 1]['message_text']},
                        ]
                    }
                    file.write(json.dumps(record, ensure_ascii=False) + "\n")
                    examples_written += 1

        if examples_written == 0:
            return jsonify({"error": "No complete user and assistant message pairs were found to export."}), 400

        return "success"
    except Exception as e:
        print("Error exporting fine-tune history:", e)
        return "error", 500

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

def get_text_from_single_file(file):
    reader = PyPDF2.PdfReader(file)
    text = ""
    for page_num in range(len(reader.pages)):
        text += reader.pages[page_num].extract_text() or ""


    return text


@app.route('/ingest-pdf', methods=['POST'])
def ingest_pdfs():

    chat_id = request.form.getlist('chat_id')[0]

# @app.route('/ingest-files', methods=['POST'])
@app.route('/ingest-files/<chat_id>/<upload_token>', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def ingest_files(chat_id, upload_token):
    try:
        files = request.files.getlist('files[]')
        MAX_CHUNK_SIZE = 1200

        if not files:
            return jsonify({"status": "error", "message": "No files were uploaded."}), 400

        uploaded_files = []
        skipped_files = []

        for file in files:
            filename = file.filename or "uploaded.pdf"
            text = get_text_from_single_file(file)

            if not text.strip():
                return jsonify({
                    "status": "error",
                    "message": f"No extractable text was found in {filename}."
                }), 400

            doc_id, doesExist = add_document_to_db(text, filename, chat_id=chat_id)

            if doesExist:
                skipped_files.append(filename)
            else:
                chunk_document(text, MAX_CHUNK_SIZE, doc_id)
                uploaded_files.append(filename)

        return jsonify({
            "status": "success",
            "uploaded": uploaded_files,
            "skipped": skipped_files,
        })
    except Exception as e:
        print("Error ingesting files:", e)
        return jsonify({"status": "error", "message": str(e)}), 500

# @app.route('/ingest-pdf', methods=['POST'])
# @cross_origin(origins='*', supports_credentials=True)
# def ingest_pdfs():
#     chat_id = request.form.get('chat_id')
#     chat_type = request.form.get('chat_type')

    
#     chat_id = request.form.getlist('chat_id')[0]

#     files = request.files.getlist('files[]')

#     MAX_CHUNK_SIZE = 1000


#     for file in files:
#         result = p.from_buffer(file)
#         text = result["content"].strip()

#         filename = file.filename

#         doc_id, doesExist = add_document_to_db(text, filename, chat_id=chat_id)

#         if not doesExist:
#            chunk_document(text, MAX_CHUNK_SIZE, doc_id)

    
#     return jsonify({"error": "Invalid JWT"}), 200

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


def format_sources_for_prompt(sources):
    return "\n\n".join(
        [
            f"Source {index + 1} ({document_name}):\n{chunk_text.strip()}"
            for index, (chunk_text, document_name) in enumerate(sources)
            if chunk_text and chunk_text.strip()
        ]
    )


def build_private_chat_prompt(query, sources):
    sources_str = format_sources_for_prompt(sources)

    if sources_str:
        return (
            "You are a helpful local assistant. Use the document context when it is relevant. "
            "If the document context is insufficient, say that clearly, then answer normally "
            "when the user is asking a general question.\n\n"
            f"Document context:\n{sources_str}\n\n"
            f"Question:\n{query}"
        )

    return (
        "You are a helpful local assistant. No document context is available for this chat. "
        "Answer the user normally.\n\n"
        f"Question:\n{query}"
    )


@app.route('/process-message-pdf', methods=['POST'])
@cross_origin(origins='*', supports_credentials=True)
def process_message_pdf():
    message = request.json.get('message') or ""
    chat_id = request.json.get('chat_id')
    model_type = request.json.get('model_type')
    model_key = request.json.get('model_key')

    ##Include part where we verify if user actually owns the chat_id later

    query = message.strip()
    if not query:
        return jsonify({"error": "Message cannot be empty."}), 400

    #This adds user message to db
    add_message_to_db(query, chat_id, 1)

    #Get most relevant section from the document
    sources = get_relevant_chunks(4, query, chat_id)
    prompt = build_private_chat_prompt(query, sources)

    if str(model_type) == "0":
        #if model_key:
        #   model_use = model_key
        #else:
        #   model_use = "gpt-4"

        print("using LLama2")
        try:
            response = ollama.chat(model='llama2', messages=[
                {
                'role': 'user',
                'content': prompt,
                
                },
            ])
            answer = response['message']['content']
        except Exception as e:
            print("Error with llama2:", e)
            return jsonify({"error": f"Error with llama2: {e}"}), 500
    else:
        print("using mistral")
        try:
            response = ollama.chat(model='mistral', messages=[
                {
                'role': 'user',
                'content': prompt,
                
                },
            ])
            answer = response['message']['content']
        except Exception as e:
            print("Error with Mistral:", e)
            return jsonify({"error": f"Error with Mistral: {e}"}), 500

    #This adds bot message
    message_id = add_message_to_db(answer, chat_id, 0)
    
    try:
        if sources:
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
        MAX_CHUNK_SIZE = 1200

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

if __name__ == '__main__':
    app.run(port=5000)
