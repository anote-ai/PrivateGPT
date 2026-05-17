# PrivateGPT Desktop — Codebase Setup

## What is PrivateGPT?

PrivateGPT is a secure, private chatbot desktop application built for on-premise deployment. It uses zero-shot models so your data never leaves your infrastructure. Download it at [anote.ai/downloadprivategpt](https://anote.ai/downloadprivategpt).

## Architecture

| Layer | Technology |
|-------|------------|
| Desktop wrapper | Electron (Node.js) |
| Frontend UI | React |
| Backend API | Python (FastAPI) |

The Electron main process (`main.js`) launches the Python backend as a child process and serves the React frontend. The `forge.config.js` controls packaging and distribution targets.

## Prerequisites

- **Node.js** 18+
- **npm** (bundled with Node)
- **Python** 3.11+
- **pip** (bundled with Python)

## Quick Start (Development Mode)

1. **Clone the repository**
   ```bash
   git clone https://github.com/anote-ai/PrivateGPT.git
   cd PrivateGPT
   ```

2. **Install Electron and root dependencies**
   ```bash
   npm install --legacy-peer-deps
   ```

3. **Install Python backend dependencies**
   ```bash
   cd backend
   pip install -r requirements.txt
   cd ..
   ```

4. **Configure environment variables**
   ```bash
   cp backend/.env.example backend/.env
   # Edit backend/.env and fill in your API keys
   ```

5. **Start the app (Electron + hot reload)**
   ```bash
   npm start
   ```

## Environment Variables

Set these in `backend/.env`:

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key for GPT models |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude models |
| `MODEL_PATH` | Path to local model weights (for on-premise inference) |

## Running the Backend Only

```bash
cd backend
python app.py
```

The FastAPI server starts on `http://localhost:8000` by default.

## Building for Distribution

```bash
npm run make
```

This invokes Electron Forge and produces platform-specific installers in `out/make/`. Run on the target OS (macOS for `.dmg`, Windows for `.exe`, Linux for `.deb`/`.rpm`).

## CI/CD

| Workflow | Trigger | What it does |
|----------|---------|---------------|
| `ci.yml` | PRs and pushes to `main` | Lints Python backend with `ruff`; validates frontend build |
| `release.yml` | Tag push matching `v*` | Builds the Electron app on macOS, Windows, and Linux |

## Distribution

When a release tag (e.g. `v1.2.0`) is pushed, GitHub Actions builds installers for all three platforms and uploads them as artifacts to the GitHub Release. End-users can download the appropriate installer from the Releases page or from [anote.ai/downloadprivategpt](https://anote.ai/downloadprivategpt).
