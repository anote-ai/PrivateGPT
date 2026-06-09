import sqlite3
import os
import hashlib
import re
from collections import Counter
#import ray
import numpy as np
from sec_api import QueryApi, RenderApi
import requests
import PyPDF2
import sys

#Todo: hardcode these when deploying
#sec_api_key=os.environ.get('sec_api_key')
sec_api_key="105d85762b9138da11aa136b3313112c93888324437c9aff80c3babfa607ac34"


USER_ID = 1
LOCAL_VECTOR_SIZE = 512
DEFAULT_CHUNK_OVERLAP = 200

TOKEN_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9$%.-]*")
STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from",
    "has", "have", "in", "into", "is", "it", "its", "of", "on", "or", "that",
    "the", "their", "this", "to", "was", "were", "will", "with", "you", "your",
}

#PROJECT_ROOT = os.path.dirname(os.path.realpath(__file__))
#DATABASE = os.path.join(PROJECT_ROOT, 'backend', 'database', 'database.db')

try:
    import ray._private.memory_monitor
except ImportError:
    pass  # Handle the case where the import fails

def get_application_path():
    if getattr(sys, 'frozen', False):
        # If the application is bundled with PyInstaller
        return sys._MEIPASS
    else:
        # Normal execution
        return os.path.dirname(os.path.abspath(__file__))

def dict_factory(cursor, row):
    d = {}
    for idx, col in enumerate(cursor.description):
        d[col[0]] = row[idx]
    return d

def get_db_connection():
    #application_path = get_application_path()
    #db_path = os.path.join(application_path, 'appdist', 'database.db') #get error unable to open db file
    #db_path = os.path.join(application_path, 'database.db')
    db_path = os.environ.get('DB_PATH', './database.db')
    
    conn = sqlite3.connect(db_path)
    conn.row_factory = dict_factory
    cursor = conn.cursor()

    return conn, cursor

## General for all chatbots
# Chat_type is an integer where 0=chatbot, 1=Edgar, 2=PDFUploader, etc
def add_chat_to_db(chat_type, model_type): #intake the current userID and the model type into the chat table
    conn, cursor = get_db_connection()

    cursor.execute('INSERT INTO chats (user_id, model_type, associated_task) VALUES (?, ?, ?)', (USER_ID, model_type, chat_type))
    chat_id = cursor.lastrowid

    name = f"Chat {chat_id}"
    cursor.execute('UPDATE chats SET chat_name = ? WHERE id = ?', (name, chat_id))

    conn.commit()
    conn.close() 

    return chat_id

def update_chat_name_db(chat_id, new_name):
    conn, cursor = get_db_connection()

    query = """
    UPDATE chats
    JOIN users ON chats.user_id = users.id
    SET chats.chat_name = ?
    WHERE chats.id = ? AND users.id = ?;
    """
    cursor.execute(query, (new_name, chat_id, USER_ID))

    conn.commit()
    conn.close()

    return

def retrieve_chats_from_db():
    conn, cursor = get_db_connection()

    query = """
        SELECT chats.id, chats.model_type, chats.chat_name, chats.associated_task, chats.ticker, chats.custom_model_key
        FROM chats
        JOIN users ON chats.user_id = users.id
        WHERE users.id = ?;
        """

    # Execute the query
    cursor.execute(query, (USER_ID,))
    chat_info = cursor.fetchall()

    conn.close()

    return chat_info


def retrieve_message_from_db(chat_id, chat_type):
    conn, cursor = get_db_connection()

    query = """
        SELECT messages.created, messages.message_text, messages.sent_from_user, messages.relevant_chunks
        FROM messages
        JOIN chats ON messages.chat_id = chats.id
        JOIN users ON chats.user_id = users.id
        WHERE chats.id = ? AND users.id = ? AND chats.associated_task = ?;
        """


    # Execute the query
    cursor.execute(query, (chat_id, USER_ID, chat_type))
    messages = cursor.fetchall()

    conn.commit()
    conn.close()

    return messages


def delete_chat_from_db(chat_id):
    print("delete chat from db")
    conn, cursor = get_db_connection()

    delete_chunks_query = """
    DELETE FROM chunks
    WHERE document_id IN (
        SELECT id FROM documents WHERE chat_id = ?
    )
    """
    cursor.execute(delete_chunks_query, (chat_id,))

    delete_documents_query = """
    DELETE FROM documents
    WHERE chat_id = ?
    """
    cursor.execute(delete_documents_query, (chat_id,))
    
    delete_messages_query = """
    DELETE FROM messages
    WHERE chat_id = ?
    """
    cursor.execute(delete_messages_query, (chat_id,))
    
    delete_chat_query = """
    DELETE FROM chats
    WHERE id = ? AND user_id = ?
    """
    cursor.execute(delete_chat_query, (chat_id, USER_ID))

    conn.commit()

    if cursor.rowcount > 0:
        print(f"Deleted chat with ID {chat_id} for user {USER_ID}.")
        conn.close()
        return 'Successfully deleted'
    else:
        print(f"No chat deleted. Chat ID {chat_id} may not exist or does not belong to user {USER_ID}.")
        conn.close()
        return 'Could not delete'


def reset_chat_db(chat_id):
    print("reset chat")
    conn, cursor = get_db_connection()

    delete_messages_query = """
    DELETE FROM messages
    WHERE chat_id = ? AND EXISTS (
        SELECT 1 FROM chats
        WHERE chats.id = messages.chat_id
        AND chats.user_id = ?
    );
    """
    cursor.execute(delete_messages_query, (chat_id, USER_ID))

    conn.commit()

    if cursor.rowcount > 0:
        print(f"Deleted chat with ID {chat_id} for user {USER_ID}.")
        conn.close()
        return 'Successfully deleted'
    else:
        print(f"No chat deleted. Chat ID {chat_id} may not exist or does not belong to user {USER_ID}.")
        conn.close()
        return 'Could not delete'
    
    
def reset_uploaded_docs(chat_id):
    conn, cursor = get_db_connection()

    delete_chunks_query = """
    DELETE FROM chunks
    WHERE document_id IN (
        SELECT id FROM documents
        WHERE chat_id = ?
    )
    """
    cursor.execute(delete_chunks_query, (chat_id,))

    delete_documents_query = """
    DELETE FROM documents
    WHERE chat_id = ? AND EXISTS (
        SELECT 1 FROM chats
        WHERE chats.id = documents.chat_id
        AND chats.user_id = ?
    )
    """
    cursor.execute(delete_documents_query, (chat_id, USER_ID))

    conn.commit()

    conn.close()


def find_most_recent_chat_from_db():
    conn, cursor = get_db_connection()

    query = """
        SELECT chats.id, chats.chat_name
        FROM chats
        JOIN users ON chats.user_id = users.id
        WHERE users.id = ?
        ORDER BY chats.created DESC
        LIMIT 1;
    """

    # Execute the query
    cursor.execute(query, (USER_ID,))
    chat_info = cursor.fetchone()

    conn.commit()
    conn.close()

    return chat_info

def change_chat_mode_db(chat_mode_to_change_to, chat_id):
    conn, cursor = get_db_connection()

    query = """
    UPDATE chats
    JOIN users ON chats.user_id = users.id
    SET chats.model_type = ?
    WHERE chats.id = ? AND users.id = ?;
    """
    
    # Execute the query
    cursor.execute(query, (chat_mode_to_change_to, chat_id, USER_ID))

    conn.commit()
    conn.close()

def add_document_to_db(text, document_name, chat_id):
    conn, cursor = get_db_connection()

    cursor.execute("SELECT id, document_text FROM documents WHERE document_name = ? AND chat_id = ?", (document_name, chat_id))
    existing_doc = cursor.fetchone()

    if existing_doc:
        existing_doc_id = existing_doc["id"]
        print("Doc named ", document_name, " exists. Do not create a new entry")
        conn.close()
        return existing_doc_id, True  # Returning the ID of the existing document


    storage_key = "temp"
    cursor.execute("INSERT INTO documents (chat_id, document_name, document_text, storage_key) VALUES (?, ?, ?, ?)", (chat_id, document_name, text, storage_key))

    doc_id = cursor.lastrowid

    conn.commit()
    conn.close()

    return doc_id, False


def normalize_chunk_text(text):
    return re.sub(r"\s+", " ", text or "").strip()


def tokenize_for_retrieval(text):
    tokens = TOKEN_RE.findall(text or "")
    return [
        token.lower()
        for token in tokens
        if len(token) > 1 and token.lower() not in STOPWORDS
    ]


def make_local_embedding(text):
    vector = np.zeros(LOCAL_VECTOR_SIZE, dtype=np.float32)
    token_counts = Counter(tokenize_for_retrieval(text))

    for token, count in token_counts.items():
        digest = hashlib.blake2b(token.encode("utf-8"), digest_size=8).digest()
        bucket = int.from_bytes(digest[:4], "little") % LOCAL_VECTOR_SIZE
        sign = 1.0 if digest[4] & 1 else -1.0
        vector[bucket] += sign * (1.0 + np.log1p(count))

    norm = np.linalg.norm(vector)
    if norm > 0:
        vector /= norm

    return vector


#@ray.remote
def chunk_document(text, maxChunkSize, document_id, overlap=DEFAULT_CHUNK_OVERLAP):
    conn, cursor = get_db_connection()

    chunks = []
    startIndex = 0
    maxChunkSize = max(1, int(maxChunkSize))
    overlap = min(max(0, int(overlap)), maxChunkSize - 1)
    stride = maxChunkSize - overlap
    
    while startIndex < len(text):
        endIndex = min(startIndex + maxChunkSize, len(text))
        chunkText = normalize_chunk_text(text[startIndex:endIndex])

        if not chunkText:
            startIndex += stride
            continue

        embeddingVector = make_local_embedding(chunkText)
        blob = embeddingVector.tobytes()
        chunks.append({
            "text": chunkText,
            "start_index": startIndex,
            "end_index": endIndex,
            "embedding_vector": embeddingVector,
            "embedding_vector_blob": blob,
        })

        if endIndex >= len(text):
            break

        startIndex += stride

    for chunk in chunks:
        cursor.execute('INSERT INTO chunks (start_index, end_index, document_id, embedding_vector) VALUES (?,?,?,?)', [chunk["start_index"], chunk["end_index"], document_id, chunk["embedding_vector_blob"]])

    conn.commit()
    conn.close()


def knn(x, y):
    x_norm = np.linalg.norm(x)
    if x_norm == 0 or len(y) == 0:
        return []

    y_norms = np.linalg.norm(y, axis=1)
    valid = y_norms > 0
    similarities = np.full(len(y), -1.0, dtype=np.float32)
    similarities[valid] = np.dot(y[valid], x) / (y_norms[valid] * x_norm)
    nearest_neighbors = np.argsort(-similarities)

    results = []
    for i in range(len(nearest_neighbors)):
        item = {
            "index": nearest_neighbors[i],
            "similarity_score": similarities[nearest_neighbors[i]]
        }
        results.append(item)

    return results


def rebuild_chunks_for_chat(chat_id, maxChunkSize=1200):
    conn, cursor = get_db_connection()

    cursor.execute("SELECT id, document_text FROM documents WHERE chat_id = ?", (chat_id,))
    documents = cursor.fetchall()

    cursor.execute(
        """
        DELETE FROM chunks
        WHERE document_id IN (
            SELECT id FROM documents WHERE chat_id = ?
        )
        """,
        (chat_id,),
    )
    conn.commit()
    conn.close()

    for document in documents:
        chunk_document(document["document_text"], maxChunkSize, document["id"])


def get_relevant_chunks(k, question, chat_id, allow_rebuild=True):
    conn, cursor = get_db_connection()

    query = """
    SELECT c.start_index, c.end_index, c.embedding_vector, c.document_id, c.page_number, d.document_name
    FROM chunks c
    JOIN documents d ON c.document_id = d.id
    JOIN chats ch ON d.chat_id = ch.id
    JOIN users u ON ch.user_id = u.id
    WHERE u.id = ? AND ch.id = ?
    """

    cursor.execute(query, (USER_ID, chat_id))
    rows = cursor.fetchall()

    embeddings = []
    valid_rows = []
    for row in rows:
        embeddingVectorBlob = row["embedding_vector"]
        embeddingVector = np.frombuffer(embeddingVectorBlob, dtype=np.float32)
        if len(embeddingVector) != LOCAL_VECTOR_SIZE:
            continue

        embeddings.append(embeddingVector)
        valid_rows.append(row)

    if (len(embeddings) == 0):
        conn.close()
        if rows and allow_rebuild:
            rebuild_chunks_for_chat(chat_id)
            return get_relevant_chunks(k, question, chat_id, allow_rebuild=False)

        return []

    embeddings = np.array(embeddings)

    embeddingVector = make_local_embedding(question)

    res = knn(embeddingVector, embeddings)
    num_results = min(k, len(res))

    #Get the k most relevant chunks
    source_chunks = []
    for i in range(num_results):
        source_id = res[i]['index']

        document_id = valid_rows[source_id]['document_id']
        document_name = valid_rows[source_id]['document_name']


        cursor.execute('SELECT document_text FROM documents WHERE id = ?', (document_id,))
        doc_text = cursor.fetchone()['document_text']

        source_chunk = doc_text[valid_rows[source_id]['start_index']:valid_rows[source_id]['end_index']]
        source_chunks.append((source_chunk, document_name))

    conn.close()

    return source_chunks

def add_sources_to_db(message_id, sources):
    print("i am in sources")
    combined_sources = ""

    for source in sources:
        chunk_text, document_name = source
        combined_sources += f"Document: {document_name}: {chunk_text}\n\n"

    conn, cursor = get_db_connection()

    cursor.execute('UPDATE messages SET relevant_chunks = ? WHERE id = ?', (combined_sources, message_id))

    conn.commit()

    cursor.close()
    conn.close()

def add_message_to_db(text, chat_id, isUser):
    #If isUser is 0, it is a bot message, 1 is a user message
    conn, cursor = get_db_connection()

    cursor.execute('INSERT INTO messages (message_text, chat_id, sent_from_user) VALUES (?,?,?)', (text, chat_id, isUser))
    message_id = cursor.lastrowid

    conn.commit()
    conn.close()

    return message_id


def retrieve_docs_from_db(chat_id):
    conn, cursor = get_db_connection()

    query = """
        SELECT documents.document_name, documents.id
        FROM documents
        JOIN chats ON documents.chat_id = chats.id
        JOIN users ON chats.user_id = users.id
        WHERE chats.id = ? AND users.id = ?;
        """

    # Execute the query
    cursor.execute(query, (chat_id, USER_ID))
    docs = cursor.fetchall()

    conn.commit()
    conn.close()

    return docs


def delete_doc_from_db(doc_id):
    #Deletes the document and the associated chunks in the db
    conn, cursor = get_db_connection()

    verification_query = """
            SELECT d.id
            FROM documents d
            JOIN chats c ON d.chat_id = c.id
            JOIN users u ON c.user_id = u.id
            WHERE u.id = ? AND d.id = ?
        """
    cursor.execute(verification_query, (USER_ID, doc_id))
    verification_result = cursor.fetchone()

    if verification_result:
        delete_chunks_query = "DELETE FROM chunks WHERE document_id = ?"
        cursor.execute(delete_chunks_query, (doc_id,))
        delete_document_query = "DELETE FROM documents WHERE id = ?"
        cursor.execute(delete_document_query, (doc_id,))
        conn.commit()
    else:
        print("Document does not belong to the user or does not exist.")

    cursor.close()
    conn.close()

    return "success"

def add_model_key_to_db(model_key, chat_id, user_email):
    conn, cursor = get_db_connection()

    update_query = """
        UPDATE chats
        JOIN users ON chats.user_id = users.id
        SET chats.custom_model_key = ?
        WHERE chats.id = ? AND users.email = ?;
        """

    cursor.execute(update_query, (model_key, chat_id, USER_ID))

    conn.commit()

#For edgar
queryApi = QueryApi(api_key=sec_api_key)

def check_valid_api(ticker):
    print("IN CHECK_VALID_API: ", ticker)
    year = 2023

    ticker_query = 'ticker:({})'.format(ticker)
    query_string = '{ticker_query} AND filedAt:[{year}-01-01 TO {year}-12-31] AND formType:"10-K" AND NOT formType:"10-K/A" AND NOT formType:NT'.format(ticker_query=ticker_query, year=year)

    query = {
        "query": { "query_string": {
            "query": query_string,
            "time_zone": "America/New_York"
        } },
        "from": "0",
        "size": "200",
        "sort": [{ "filedAt": { "order": "desc" } }]
      }


    response = queryApi.get_filings(query)

    filings = response['filings']

    if not filings:
        return False
    else:
        return True
    

def download_10K_url_ticker(ticker):
    year = 2023

    ticker_query = 'ticker:({})'.format(ticker)
    query_string = '{ticker_query} AND filedAt:[{year}-01-01 TO {year}-12-31] AND formType:"10-K" AND NOT formType:"10-K/A" AND NOT formType:NT'.format(ticker_query=ticker_query, year=year)

    query = {
        "query": { "query_string": {
            "query": query_string,
            "time_zone": "America/New_York"
        } },
        "from": "0",
        "size": "200",
        "sort": [{ "filedAt": { "order": "desc" } }]
      }


    response = queryApi.get_filings(query)

    filings = response['filings']

    if filings:
       ticker=filings[0]['ticker']
       url=filings[0]['linkToFilingDetails']
    else:
       ticker = None
       url = None

    return url, ticker

def download_filing_as_pdf(url, ticker):
    API_ENDPOINT = "https://api.sec-api.io/filing-reader"

    api_url = API_ENDPOINT + "?token=" + sec_api_key + "&url=" + url + "&type=pdf"

    response = requests.get(api_url)

    file_name = f"{ticker}.pdf"

    with open(file_name, 'wb') as f:
        f.write(response.content)

    return file_name

def get_text_from_single_file(file):
    reader = PyPDF2.PdfReader(file)
    text = ""

    for page_num in range(len(reader.pages)):

        text += reader.pages[page_num].extract_text() or ""

    return text

def add_ticker_to_chat_db(chat_id, ticker, isUpdate):
    conn, cursor = get_db_connection()

    if isUpdate:
        try: 
            reset_chat_db(chat_id)
        except:
            return "Error"
    
    query = """UPDATE chats
               SET ticker = ?
               WHERE id = ? AND user_id = ?"""

    cursor.execute(query, (ticker, chat_id, USER_ID))

    conn.commit()

    cursor.close()
    conn.close()

    return "Success"
