"""
Pytest configuration and shared fixtures for the PrivateGPT backend test suite.
"""
import os
import sys
import pytest

# Ensure backend directory is on the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# Use a temporary in-memory database for all tests
os.environ['DB_PATH'] = ':memory:'
os.environ['SEC_API_KEY'] = 'test-sec-key'
os.environ['OPENAI_API_KEY'] = 'test-openai-key'


@pytest.fixture(scope='session')
def app():
    """Create Flask test app with an in-memory SQLite database."""
    from app import app as flask_app
    flask_app.config['TESTING'] = True
    flask_app.config['WTF_CSRF_ENABLED'] = False
    yield flask_app


@pytest.fixture(scope='session')
def client(app):
    """Return a test client for the Flask app."""
    return app.test_client()


@pytest.fixture(scope='function')
def db_connection():
    """Provide a fresh in-memory DB connection and initialize the schema for each test."""
    import sqlite3

    conn = sqlite3.connect(':memory:')
    conn.row_factory = sqlite3.Row

    schema_path = os.path.join(os.path.dirname(__file__), '..', 'database', 'schema.sql')
    if os.path.exists(schema_path):
        with open(schema_path, 'r') as f:
            conn.executescript(f.read())
    else:
        # Minimal schema for testing
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE,
                password_hash TEXT
            );
            CREATE TABLE IF NOT EXISTS chats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                chat_name TEXT,
                model_type INTEGER DEFAULT 0,
                associated_task INTEGER DEFAULT 0,
                ticker TEXT,
                custom_model_key TEXT,
                created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_text TEXT,
                chat_id INTEGER,
                sent_from_user INTEGER,
                relevant_chunks TEXT,
                created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id INTEGER,
                document_name TEXT,
                document_text TEXT,
                storage_key TEXT
            );
            CREATE TABLE IF NOT EXISTS chunks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                start_index INTEGER,
                end_index INTEGER,
                document_id INTEGER,
                embedding_vector BLOB,
                page_number INTEGER
            );
            INSERT INTO users (id, email, password_hash) VALUES (1, 'test@test.com', 'hashed');
        """)

    yield conn
    conn.close()
