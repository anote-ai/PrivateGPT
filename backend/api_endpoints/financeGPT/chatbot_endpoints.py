import sqlite3
import os
import openai
import numpy as np
from sec_api import QueryApi, RenderApi
import requests
import PyPDF2
import sys

from dotenv import load_dotenv
load_dotenv()

sec_api_key = os.environ.get("SEC_API_KEY", "")

USER_ID = 1

try:
    import ray._private.memory_monitor
except ImportError:
    pass

# QueryApi is initialised lazily so the app can start even when SEC_API_KEY
# is not set (EDGAR features will raise at call time, not import time).
_queryApi = None


def _get_query_api():
    global _queryApi
    if _queryApi is None:
        if not sec_api_key:
            raise RuntimeError(
                "SEC_API_KEY environment variable is not set. "
                "It is required for EDGAR features. Add it to backend/.env."
            )
        _queryApi = QueryApi(api_key=sec_api_key)
    return _queryApi


def get_application_path():
    if getattr(sys, 'frozen', False):
        return sys._MEIPASS
    return os.path.dirname(os.path.abspath(__file__))


def dict_factory(cursor, row):
    d = {}
    for idx, col in enumerate(cursor.description):
        d[col[0]] = row[idx]
    return d


def get_db_connection():
    db_path = os.environ.get('DB_PATH', './database.db')
    conn = sqlite3.connect(db_path)
    conn.row_factory = dict_factory
    cursor = conn.cursor()
    return conn, cursor


def add_chat_to_db(chat_type, model_type):
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


def retrieve_chats_from_db():
    conn, cursor = get_db_connection()
    query = """
        SELECT chats.id, chats.model_type, chats.chat_name, chats.associated_task, chats.ticker, chats.custom_model_key
        FROM chats
        JOIN users ON chats.user_id = users.id
        WHERE users.id = ?;
        """
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
    cursor.execute(query, (chat_id, USER_ID, chat_type))
    messages = cursor.fetchall()
    conn.commit()
    conn.close()
    return messages


def delete_chat_from_db(chat_id):
    conn, cursor = get_db_connection()
    cursor.execute("DELETE FROM chunks WHERE document_id IN (SELECT id FROM documents WHERE chat_id = ?)", (chat_id,))
    cursor.execute("DELETE FROM documents WHERE chat_id = ?", (chat_id,))
    cursor.execute("DELETE FROM messages WHERE chat_id = ?", (chat_id,))
    cursor.execute("DELETE FROM chats WHERE id = ? AND user_id = ?", (chat_id, USER_ID))
    conn.commit()
    if cursor.rowcount > 0:
        conn.close()
        return 'Successfully deleted'
    conn.close()
    return 'Could not delete'


def reset_chat_db(chat_id):
    conn, cursor = get_db_connection()
    cursor.execute(
        "DELETE FROM messages WHERE chat_id = ? AND EXISTS "
        "(SELECT 1 FROM chats WHERE chats.id = messages.chat_id AND chats.user_id = ?)",
        (chat_id, USER_ID)
    )
    conn.commit()
    if cursor.rowcount > 0:
        conn.close()
        return 'Successfully deleted'
    conn.close()
    return 'Could not delete'


def reset_uploaded_docs(chat_id):
    conn, cursor = get_db_connection()
    cursor.execute(
        "DELETE FROM chunks WHERE document_id IN (SELECT id FROM documents WHERE chat_id = ?)",
        (chat_id,)
    )
    cursor.execute(
        "DELETE FROM documents WHERE chat_id = ? AND EXISTS "
        "(SELECT 1 FROM chats WHERE chats.id = documents.chat_id AND chats.user_id = ?)",
        (chat_id, USER_ID)
    )
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
    cursor.execute(query, (chat_mode_to_change_to, chat_id, USER_ID))
    conn.commit()
    conn.close()


def add_document_to_db(text, document_name, chat_id):
    conn, cursor = get_db_connection()
    cursor.execute("SELECT id, document_text FROM documents WHERE document_name = ? AND chat_id = ?", (document_name, chat_id))
    existing_doc = cursor.fetchone()
    if existing_doc:
        existing_doc_id, existing_doc_text = existing_doc
        conn.close()
        return existing_doc_id, True
    storage_key = "temp"
    cursor.execute(
        "INSERT INTO documents (chat_id, document_name, document_text, storage_key) VALUES (?, ?, ?, ?)",
        (chat_id, document_name, text, storage_key)
    )
    doc_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return doc_id, False


def chunk_document(text, maxChunkSize, document_id):
    conn, cursor = get_db_connection()
    chunks = []
    startIndex = 0
    while startIndex < len(text):
        endIndex = startIndex + min(maxChunkSize, len(text))
        chunkText = text[startIndex:endIndex].replace("\n", "")
        embeddingVector = openai.embeddings.create(input=chunkText, model="text-embedding-ada-002").data[0].embedding
        embeddingVector = np.array(embeddingVector)
        blob = embeddingVector.tobytes()
        chunks.append({
            "text": chunkText,
            "start_index": startIndex,
            "end_index": endIndex,
            "embedding_vector_blob": blob,
        })
        startIndex += maxChunkSize
    for chunk in chunks:
        cursor.execute(
            'INSERT INTO chunks (start_index, end_index, document_id, embedding_vector) VALUES (?,?,?,?)',
            [chunk["start_index"], chunk["end_index"], document_id, chunk["embedding_vector_blob"]]
        )
    conn.commit()
    conn.close()


def knn(x, y):
    x = np.expand_dims(x, axis=0)
    similarities = np.dot(x, y.T) / (np.linalg.norm(x) * np.linalg.norm(y))
    distances = 1 - similarities.flatten()
    nearest_neighbors = np.argsort(distances)
    return [{"index": nearest_neighbors[i], "similarity_score": distances[nearest_neighbors[i]]} for i in range(len(nearest_neighbors))]


def get_relevant_chunks(k, question, chat_id):
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
    embeddings = [np.frombuffer(row["embedding_vector"]) for row in rows]
    if not embeddings:
        return ["No text found"] * k
    embeddings = np.array(embeddings)
    embeddingVector = np.array(openai.embeddings.create(input=question, model="text-embedding-ada-002").data[0].embedding)
    res = knn(embeddingVector, embeddings)
    num_results = min(k, len(res))
    source_chunks = []
    for i in range(num_results):
        source_id = res[i]['index']
        document_id = rows[source_id]['document_id']
        document_name = rows[source_id]['document_name']
        cursor.execute('SELECT document_text FROM documents WHERE id = ?', (document_id,))
        doc_text = cursor.fetchone()['document_text']
        source_chunk = doc_text[rows[source_id]['start_index']:rows[source_id]['end_index']]
        source_chunks.append((source_chunk, document_name))
    return source_chunks


def add_sources_to_db(message_id, sources):
    combined_sources = "".join(f"Document: {doc}: {chunk}\n\n" for chunk, doc in sources)
    conn, cursor = get_db_connection()
    cursor.execute('UPDATE messages SET relevant_chunks = ? WHERE id = ?', (combined_sources, message_id))
    conn.commit()
    conn.close()


def add_message_to_db(text, chat_id, isUser):
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
    cursor.execute(query, (chat_id, USER_ID))
    docs = cursor.fetchall()
    conn.commit()
    conn.close()
    return docs


def delete_doc_from_db(doc_id):
    conn, cursor = get_db_connection()
    cursor.execute(
        "SELECT d.id FROM documents d JOIN chats c ON d.chat_id = c.id JOIN users u ON c.user_id = u.id WHERE u.id = ? AND d.id = ?",
        (USER_ID, doc_id)
    )
    if cursor.fetchone():
        cursor.execute("DELETE FROM chunks WHERE document_id = ?", (doc_id,))
        cursor.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
        conn.commit()
    conn.close()
    return "success"


def add_model_key_to_db(model_key, chat_id, user_email=None):
    conn, cursor = get_db_connection()
    update_query = """
        UPDATE chats
        JOIN users ON chats.user_id = users.id
        SET chats.custom_model_key = ?
        WHERE chats.id = ? AND users.id = ?;
        """
    cursor.execute(update_query, (model_key, chat_id, USER_ID))
    conn.commit()
    conn.close()


def check_valid_api(ticker):
    year = 2023
    ticker_query = 'ticker:({})'.format(ticker)
    query_string = '{ticker_query} AND filedAt:[{year}-01-01 TO {year}-12-31] AND formType:"10-K" AND NOT formType:"10-K/A" AND NOT formType:NT'.format(
        ticker_query=ticker_query, year=year
    )
    query = {
        "query": {"query_string": {"query": query_string, "time_zone": "America/New_York"}},
        "from": "0", "size": "200",
        "sort": [{"filedAt": {"order": "desc"}}]
    }
    response = _get_query_api().get_filings(query)
    return bool(response['filings'])


def download_10K_url_ticker(ticker):
    year = 2023
    ticker_query = 'ticker:({})'.format(ticker)
    query_string = '{ticker_query} AND filedAt:[{year}-01-01 TO {year}-12-31] AND formType:"10-K" AND NOT formType:"10-K/A" AND NOT formType:NT'.format(
        ticker_query=ticker_query, year=year
    )
    query = {
        "query": {"query_string": {"query": query_string, "time_zone": "America/New_York"}},
        "from": "0", "size": "200",
        "sort": [{"filedAt": {"order": "desc"}}]
    }
    response = _get_query_api().get_filings(query)
    filings = response['filings']
    if filings:
        return filings[0]['linkToFilingDetails'], filings[0]['ticker']
    return None, None


def download_filing_as_pdf(url, ticker):
    api_url = f"https://api.sec-api.io/filing-reader?token={sec_api_key}&url={url}&type=pdf"
    response = requests.get(api_url)
    file_name = f"{ticker}.pdf"
    with open(file_name, 'wb') as f:
        f.write(response.content)
    return file_name


def get_text_from_single_file(file):
    reader = PyPDF2.PdfReader(file)
    return "".join(reader.pages[i].extract_text() for i in range(len(reader.pages)))


def add_ticker_to_chat_db(chat_id, ticker, isUpdate):
    conn, cursor = get_db_connection()
    if isUpdate:
        try:
            reset_chat_db(chat_id)
        except Exception:
            return "Error"
    cursor.execute("UPDATE chats SET ticker = ? WHERE id = ? AND user_id = ?", (ticker, chat_id, USER_ID))
    conn.commit()
    conn.close()
    return "Success"
