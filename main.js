const { app, BrowserWindow } = require("electron");
const express = require("express");
const path = require("path");

const { spawn } = require("child_process");

const log = require('electron-log');
const http = require('http');

console.log = log.log;
console.error = log.error;

//console.log(log.transports.file.getFile().path);

let flaskProcess = null;
let mainWindow = null;

// Create Express app
const server = express();

// Serve static files from the React app
const staticPath = path.join(__dirname, "./frontend/build");
server.use(express.static(staticPath));
server.get("/downloads/chat-history.csv", (req, res) => {
    res.download(path.join(__dirname, "output_document", "chat_history.csv"));
});
server.get("/downloads/finetune-chat-history.jsonl", (req, res) => {
    res.download(path.join(__dirname, "output_document", "finetune_chat_history.jsonl"));
});

// Start the server
const FRONTEND_PORT = 3000;
const BACKEND_PORT = 5000;
server.listen(FRONTEND_PORT, () => {
    console.log(`Server running on http://localhost:${FRONTEND_PORT}`);
});

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        show: false // Initially don't show the window
    });

    mainWindow.loadURL(`http://localhost:${FRONTEND_PORT}`);
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        console.log("Main window shown.");
    });

    //mainWindow.webContents.openDevTools();
}

function createWindow() {
    let appDistPath = process.env.NODE_ENV === 'production' ? path.join(process.resourcesPath, 'appdist') : path.join(__dirname, 'appdist');
    const dbPath = path.join(appDistPath, 'database.db');
    let backendPath = path.join(appDistPath, 'app');

    flaskProcess = spawn(backendPath, [], {
        env: { ...process.env, DB_PATH: dbPath }
    });

    flaskProcess.stdout.on('data', (data) => {
        console.log(`Flask stdout: ${data.toString()}`);
    });
    
    flaskProcess.stderr.on('data', (data) => {
        console.error(`Flask stderr: ${data.toString()}`);
    });

    flaskProcess.on("error", (err) => {
        console.error("Failed to start Flask process:", err);
    });

    function pingBackend() {
        const request = http.request(
            {
                hostname: "127.0.0.1",
                port: BACKEND_PORT,
                path: "/check-models",
                method: "POST",
                timeout: 1000,
            },
            (res) => {
                res.resume();

                if (res.statusCode === 200) {
                    console.log("Flask backend is ready. Loading main window.");
                    createMainWindow();
                } else {
                    setTimeout(pingBackend, 1000);
                }
            }
        );

        request.on("timeout", () => {
            request.destroy();
        });

        request.on("error", () => {
            setTimeout(pingBackend, 1000);
        });

        request.end();
    }

    pingBackend();

}



/* app.whenReady().then(createWindow); */

app.whenReady().then(() => {
    createWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});


app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.on("will-quit", () => {
    // Ensure Flask process is killed when Electron app closes
    if (flaskProcess) flaskProcess.kill();
});
