# CLAUDE.md — PrivateGPT Codebase Guide

This file provides context for AI assistants working in this repository.

---

## Project Overview

**PrivateGPT** is a cross-platform desktop application built with Electron that delivers a private, financial AI assistant. It supports:

- Local LLM inference via Ollama (Llama2, Mistral)
- OpenAI API integration
- PDF document ingestion with semantic search (via Chroma vector DB)
- SEC/EDGAR financial filings integration
- A credit/subscription system with Stripe

The app runs a Python Flask backend bundled as an executable alongside a React frontend, all wrapped in an Electron shell.

---

## Repository Structure

```
PrivateGPT/
├── backend/                    # Python Flask API server
│   ├── app.py                  # Main Flask app, all route definitions (~540 lines)
│   ├── db_enums.py             # Enumerations for database fields
│   ├── requirements.txt        # Python dependencies
│   ├── constants/
│   │   └── global_constants.py # DB credentials, pricing tiers, plan config
│   ├── database/
│   │   ├── db.py               # MySQL connection layer (~619 lines)
│   │   └── schema.sql          # Full DB schema (11 tables)
│   ├── api_endpoints/
│   │   ├── financeGPT/
│   │   │   └── chatbot_endpoints.py  # Chat, document, EDGAR logic (~582 lines)
│   │   ├── login/              # Auth endpoints
│   │   ├── payments/           # Stripe payment endpoints
│   │   ├── refresh_credits/    # Credit management
│   │   └── user/               # User management
│   └── db/                     # Chroma vector DB storage (parquet files)
├── frontend/                   # React web application
│   ├── src/
│   │   ├── App.js              # Root component, routing
│   │   ├── financeGPT/
│   │   │   ├── components/     # Feature components (Chatbot, Home, NavbarChatbot, etc.)
│   │   │   └── styles/         # Feature-specific CSS
│   │   ├── components/         # Shared/global components
│   │   ├── redux/              # Redux slices (user state)
│   │   ├── stores/             # Redux store configuration
│   │   ├── http/               # API client (RequestConfig.js, fetcher utility)
│   │   └── styles/             # Global CSS
│   ├── package.json
│   └── tailwind.config.js
├── main.js                     # Electron entry point
├── forge.config.js             # Electron Forge packaging config
├── package.json                # Root Electron/packaging scripts
├── appdist/                    # PyInstaller + frontend build outputs (gitignored)
└── README.md                   # Setup and development instructions
```

---

## Technology Stack

### Backend
| Layer | Technology |
|-------|-----------|
| Framework | Flask 2.0.3 + Flask-CORS |
| Language | Python 3.x |
| Primary DB | SQLite3 (local), MySQL (production) |
| Vector DB | Chroma (parquet-based embeddings in `backend/db/`) |
| LLM (local) | Ollama (llama2, mistral) |
| LLM (cloud) | OpenAI API |
| Document processing | PyPDF2 |
| Financial data | sec_api (SEC EDGAR) |
| Env config | python-dotenv |

### Frontend
| Layer | Technology |
|-------|-----------|
| Framework | React 18.2.0 |
| State | Redux Toolkit + Redux Persist |
| Styling | Tailwind CSS 3.3.3 + Material-UI 5 |
| HTTP | Axios + custom `fetcher()` utility |
| Animations | Framer Motion |
| Realtime | socket.io-client |
| PDF viewing | react-pdf |

### Desktop Shell
| Layer | Technology |
|-------|-----------|
| Shell | Electron 28.2.0 |
| Packaging | Electron Forge |
| Targets | Windows (Squirrel), macOS (DMG), Linux (DEB, RPM) |

---

## Development Workflow

### Prerequisites
- Python 3.x with virtualenv
- Node.js + npm
- Ollama installed (for local model inference)

### Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate    # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py               # Runs on http://127.0.0.1:5000
```

### Frontend Setup
```bash
cd frontend
npm install --force          # --force required due to peer dependency conflicts
npm start                    # Dev server on http://localhost:3000
```

### Electron Desktop App
```bash
# From repo root
npm install
npm start                    # Launch Electron (dev mode)
npm run make                 # Package for distribution
npm run package_prod         # Production build
```

### Building Distributable
1. `cd backend && pyinstaller app.spec` → outputs `backend/dist/app`
2. `cd frontend && npm run build` → outputs `frontend/build/`
3. Copy both outputs to `appdist/`
4. From root: `npm run make`

---

## Key API Endpoints (backend/app.py)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/check-models` | Check if Ollama models are installed |
| POST | `/install-llama` | Install Llama2 via Ollama |
| POST | `/install-mistral` | Install Mistral via Ollama |
| POST | `/create-chat` | Create new chat session |
| GET | `/get-chats` | Retrieve user's chats |
| PUT | `/update-chat` | Update chat name |
| DELETE | `/delete-chat` | Delete a chat |
| POST | `/ingest-files` | Upload and process PDF documents |
| POST | `/ingest-metadata` | Ingest document metadata |
| POST | `/process-message-pdf` | Send a message in a PDF chat |
| POST | `/process-ticker-info` | Fetch and process SEC EDGAR filings |

All routes are handled via blueprints or inline in `app.py`. The frontend calls these via `http://127.0.0.1:5000`.

---

## Database Schema

Defined in `backend/database/schema.sql`. Key tables:

- **Users** — user accounts, email, hashed passwords
- **StripeInfo** — Stripe customer IDs per user
- **Subscriptions** — plan type, credit counts, expiration
- **Chats** — chat sessions linked to users
- **Messages** — individual messages in chats
- **Documents** — uploaded PDFs or ingested filings
- **Chunks** — text segments from documents for retrieval

Connection management (MySQL) lives in `backend/database/db.py`. Local SQLite is used in the desktop build.

---

## State Management (Frontend)

Redux Toolkit is used with Redux Persist for user session:

```
frontend/src/stores/       → store.js (configures persisted store)
frontend/src/redux/        → user slice (userId, sessionToken, plan info)
```

Auth token is stored in localStorage and sent as `Authorization: Bearer <token>` on every API request via `frontend/src/http/RequestConfig.js`.

---

## Naming Conventions

| Context | Convention | Example |
|---------|-----------|---------|
| React components | PascalCase | `Chatbot.js`, `NavbarChatbot.js` |
| Python modules | snake_case | `chatbot_endpoints.py`, `db.py` |
| Constants | UPPER_SNAKE_CASE | `MAX_CHUNK_SIZE`, `USER_ID` |
| CSS classes | Tailwind utility + kebab-case | `text-gray-700`, `chat-container` |
| API routes | kebab-case | `/process-message-pdf` |
| DB columns | snake_case | `user_id`, `sent_from_user` |

---

## Important Code Locations

| What | Where |
|------|-------|
| Flask app init + all routes | `backend/app.py` |
| Chat/document/EDGAR logic | `backend/api_endpoints/financeGPT/chatbot_endpoints.py` |
| MySQL DB layer | `backend/database/db.py` |
| Global config (DB creds, pricing) | `backend/constants/global_constants.py` |
| Main chatbot UI component | `frontend/src/financeGPT/components/Chatbot.js` |
| API client | `frontend/src/http/RequestConfig.js` |
| Redux user slice | `frontend/src/redux/` |
| Electron main process | `main.js` |
| Packaging config | `forge.config.js` |

---

## Security Notes

Several hardcoded secrets exist in the codebase and should be moved to environment variables:

- `backend/constants/global_constants.py` — database host, username, and password
- `backend/api_endpoints/financeGPT/chatbot_endpoints.py` — `sec_api` key

These are listed in `.gitignore` exclusions conceptually but currently committed. When modifying auth or API logic, do not add new hardcoded credentials — use `.env` via `python-dotenv` instead.

`USER_ID = 1` is hardcoded in several places as a placeholder for local single-user operation. Multi-user support requires replacing this with session-derived user IDs.

---

## Testing

Testing coverage is minimal:

- `frontend/src/App.test.js` — single smoke test using React Testing Library
- No Python unit tests exist

To run frontend tests:
```bash
cd frontend && npm test
```

When adding new features, add corresponding tests in `frontend/src/` for components and consider adding `pytest` tests in `backend/` for API endpoints.

---

## Common Gotchas

1. **`npm install --force`** is required in `frontend/` due to React peer dependency conflicts.
2. **Ollama must be running** before the backend can serve LLM requests. Check `/check-models` to verify.
3. **PORT 5000** must be free — the Flask backend binds to `127.0.0.1:5000`.
4. **Chroma vector DB** persists to `backend/db/` — deleting this directory removes all document embeddings.
5. **PyInstaller build** requires the virtualenv to be activated when running `pyinstaller app.spec`.
6. **Redux Persist** stores user state in localStorage — clear it if auth state becomes stale during development.
7. The `appdist/` directory is gitignored and must be populated manually before running `npm run make`.

---

## Chatbot Modes

The chatbot supports three operating modes configured via the UI:

1. **PDF Mode** — Upload PDFs, which are chunked and embedded. Queries use semantic search over document chunks.
2. **EDGAR Mode** — Provide a stock ticker; the app fetches 10-K filings from SEC EDGAR, ingests them, and answers financial questions.
3. **API Key Mode** — User provides their own OpenAI API key for direct LLM queries without local model requirement.

---

## Document Processing Pipeline

```
PDF upload
  → PyPDF2 text extraction
  → Chunking (MAX_CHUNK_SIZE = 1000 chars)
  → Chroma embedding + storage in backend/db/
  → On query: semantic similarity search → top-K chunks → LLM prompt
```

---

## Credit & Subscription System

Defined in `backend/constants/global_constants.py`:

- **Free** tier — limited credits
- **Basic / Standard / Premium / Enterprise** — tiered credit allotments
- Credits are decremented per message; subscription checked on login
- Stripe integration handles billing; webhooks update `Subscriptions` table
