# PrivateGPT Desktop

PrivateGPT Desktop is an Electron + React + Flask application for chatting with PDFs, analyzing SEC 10-K filings, and running translation workflows with local models or an optional OpenAI API key.

## Repository layout

- `frontend/`: React application
- `backend/`: Flask API, local model orchestration, SQLite-backed chat state
- `appdist/`: packaged backend binary copied into the Electron build

## Local development

### 1. Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python app.py
```

Notes:

- `DB_PATH` defaults to `./database.db` for local desktop development.
- `OPENAI_API_KEY` is optional, but translation and chat-level OpenAI fallback need either this env var or a saved key in the app settings.
- If `ollama` is not on your shell `PATH`, set `OLLAMA_PATH` in `backend/.env`.

### 2. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm start
```

The frontend defaults to `http://127.0.0.1:5000`. Override it with `REACT_APP_API_ENDPOINT` when needed.

### 3. Electron shell

From the repository root:

```bash
npm install
npm start
```

## Local model setup

Install Ollama from https://ollama.com/download.

The application currently supports these recommended local chat models:

- `qwen3:8b`
- `llama3.1:8b`

You can install them from the in-app settings panel, or manually with commands like:

```bash
ollama pull qwen3:8b
ollama pull llama3.1:8b
```

## Packaging the desktop app

### Build the frontend bundle

```bash
cd frontend
npm install
npm run build
```

### Package the backend binary

```bash
cd backend
source venv/bin/activate
pip install pyinstaller
pyinstaller --onefile app.py --add-data "database.db:."
```

Copy the generated binary from `backend/dist/` into `appdist/`.

### Build Electron artifacts

```bash
npm run package
```

To create distributables:

```bash
npm run make
```

## Validation

Useful checks before shipping:

```bash
npm --prefix frontend test -- --watchAll=false
npm --prefix frontend run build
python3 -m py_compile backend/app.py backend/tests/test_documents.py backend/tests/test_models.py backend/tests/test_translation.py
```
