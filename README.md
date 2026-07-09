# Anote-PrivateGPT-Desktop

## How to run it locally
1. Clone the repo `git clone https://github.com/nv78/Anote-PrivateGPT-Desktop` and `cd Anote-PrivateGPT-Desktop`

### Backend
First, compile the backend
1. `cd backend`
2. Create a virtual env in 
`python -m venv venv`
`source venv/bin/activate` \
For Windows: use Command Prompt `.\venv\Scripts\Activate`

3. Install requirements
`pip install -r requirements.txt`

4. Compile
`pyinstaller --onefile app.py --add-data "database.db:."`

5. Now, you should have an output in ./backend/dist called app. You will copy this into ./appdist

### Frontend
1. `cd frontend`
2. Install dependencies and Build react app
`npm install --force`
`npm run build`

### Install Ollama
1. Download Ollama for Mac directly from https://ollama.com/download. (Note: `brew install ollama` pulls in Apple's `mlx` as a build dependency, which requires macOS Sonoma (14+) — it will fail to install on Ventura (13) or older. Use the direct download instead on older macOS.)

2. The app manages local models through a registry in `backend/local_models.py`. Defaults are `qwen3:8b` and `llama3.1:8b`; a lighter `qwen2.5:3b` option is also available for machines with 8GB RAM or less. Pick a model in the app's Settings/Installation UI and it will run `ollama pull <model>` for you, or pull manually:
`ollama pull qwen2.5:3b` (recommended for 8GB RAM)
`ollama pull qwen3:8b` (default, needs more RAM)

3. Also pull the embedding model used for document search:
`ollama pull embeddinggemma`

4. To change the default model without using the UI, set `DEFAULT_LOCAL_CHAT_MODEL_TYPE` in `backend/.env` (see `backend/.env.example`) to the index of the model in `LOCAL_CHAT_MODELS`.

5. **macOS 12/13 (Ventura or older) known issue:** local inference can crash with `GGML_ASSERT(buf_dst) failed` — a llama.cpp Metal/GPU bug on older macOS (see [ggml-org/llama.cpp#16266](https://github.com/ggml-org/llama.cpp/issues/16266)), independent of which model you pick. Workaround: set `OLLAMA_NUM_GPU=0` in `backend/.env` to force CPU-only inference (slower, but stable). This is fixed by upgrading to macOS Sonoma (14+).

### Running the whole app
1. In the home directory (/Anote-Private-GPT), you will install dependencies:
`npm install --force`

2. Then you will run the app by doing `npm run start`

## Dev stuff
To Run the code:
1. Open backend folder in terminal
`cd backend`

2. Create a virtual env in 
`python -m venv venv`
`source venv/bin/activate` \
For Windows: use Command Prompt `.\venv\Scripts\Activate`

3. Install pyinstaller
`pip install pyinstaller`

4. Build the backend

To include the db: `pyinstaller --onefile app.py --add-data "database.db:."`

Note: might have to do `pyinstaller --onefile app.py --hidden-import flask`

Put the flask app, which is in the folder backend/dist in appdist

6. Open frontend folder in terminal
`cd ..`
`cd frontend`

7. Install dependencies and Build react app
`npm install --force`
`npm run build`

8. Go back to main folder
`cd ..`

9. Install all dependencies and run electron
`npm install`
`npm start`

10. To package/bundle, run for mac: `npm run make`, and for Linux: `sudo npx electron-forge make --platform=linux --arch=x64`


Install private models (should include this under installation instructions under the app later):
1. Follow installation instructions at https://github.com/ollama/ollama
2. On your terminal, run `ollama pull qwen2.5:3b` (or another model from `backend/local_models.py`)
