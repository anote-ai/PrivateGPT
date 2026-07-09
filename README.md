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

### Install Ollama
1. Download Ollama for Mac directly from https://ollama.com/download. (Note: `brew install ollama` pulls in Apple's `mlx` as a build dependency, which requires macOS Sonoma (14+) — it will fail to install on Ventura (13) or older. Use the direct download instead on older macOS.)

2. The app manages local models through a registry in `backend/local_models.py`. Defaults are `qwen3:8b` and `llama3.1:8b`; a lighter `qwen2.5:3b` option is also available for machines with 8GB RAM or less. Pick a model in the app's Settings/Installation UI and it will run `ollama pull <model>` for you, or pull manually:
`ollama pull qwen2.5:3b` (recommended for 8GB RAM)
`ollama pull qwen3:8b` (default, needs more RAM)

3. Also pull the embedding model used for document search:
`ollama pull embeddinggemma`

4. To change the default model without using the UI, set `DEFAULT_LOCAL_CHAT_MODEL_TYPE` in `backend/.env` (see `backend/.env.example`) to the index of the model in `LOCAL_CHAT_MODELS`.

5. **macOS 12/13 (Ventura or older) known issue:** local inference can crash with `GGML_ASSERT(buf_dst) failed` — a llama.cpp Metal/GPU bug on older macOS (see [ggml-org/llama.cpp#16266](https://github.com/ggml-org/llama.cpp/issues/16266)), independent of which model you pick. Workaround: set `OLLAMA_NUM_GPU=0` in `backend/.env` to force CPU-only inference (slower, but stable). This is fixed by upgrading to macOS Sonoma (14+).

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
