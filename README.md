
# Burry: portfolio chatbot

Burry is an AI assistant for your portfolio. It lives in the bottom-right corner of the page, reminds visitors to chat every 8-9 seconds, and answers questions about your skills, projects, experience and background using the OpenRouter API.

- **Backend:** Python 3.11.9 + Flask (keeps your API key private, streams replies)
- **Frontend:** your portfolio (HTML/CSS/JS) + the Burry widget (`burry.css`, `burry.js`)
- **Design:** uses your portfolio's own crimson / gold / copper / cream palette and Space Grotesk font

```
burry-chatbot/
├── backend/
│   ├── app.py          Flask server + OpenRouter streaming
│   └── knowledge.py    Everything Burry knows about you (edit this)
├── frontend/
│   ├── index.html      Your portfolio (only 2 lines added: Burry's CSS + JS)
│   └── static/
│       ├── burry.css   Chat widget design
│       └── burry.js    Chat widget logic + 8-9 s reminder
├── .vscode/            VS Code run/debug settings
├── .env.example        Copy to .env and add your key
└── requirements.txt
```

---

## Run it in VS Code (Windows)

1. **Install Python 3.11.9** from python.org (tick "Add python.exe to PATH") and open this folder in VS Code (`File > Open Folder`). Install the **Python** extension when VS Code suggests it.

2. **Create a virtual environment.** Open the terminal (`Ctrl + ~`):
   ```powershell
   py -3.11 -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
   ```
   If PowerShell blocks activation, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once.
   If VS Code asks which interpreter to use, pick `.venv`.

3. **Add your OpenRouter key.** Create a free key at <https://openrouter.ai/keys>, then copy `.env.example` to a new file named `.env` and paste the key:
   ```
   OPENROUTER_API_KEY=sk-or-v1-...
   ```

4. **Start the server.** Press **F5** (choose "Run Burry (Flask)"), or in the terminal:
   ```powershell
   python backend/app.py
   ```

5. Open **http://127.0.0.1:5000**. Burry appears in the bottom-right corner.

macOS/Linux: replace step 2 with `python3.11 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`.

> **Using Live Server instead?** Keep `python backend/app.py` running, then right-click `frontend/index.html` > *Open with Live Server*. Burry automatically talks to `http://127.0.0.1:5000`.

---

## Customize

**What Burry knows:** edit `backend/knowledge.py` (profile, skills, projects, experience, process, contact). Restart the server after saving. Burry is instructed to use *only* this information and to say so when it doesn't know something, rather than make things up.

**Things to fill in (marked `TODO` in `knowledge.py`):** your portfolio page doesn't show a name, and the email / GitHub / LinkedIn on the page are still placeholders (`you@example.com`, `yourusername`). Update them in `knowledge.py` **and** in `frontend/index.html` so Burry and the page agree.

**Reminder timing:** top of `frontend/static/burry.js`: `NUDGE_MIN_MS` / `NUDGE_MAX_MS` (8000-9000 ms) and `NUDGE_VISIBLE_MS`. Reminder wording is in the `NUDGES` list; quick-reply buttons are in `QUICK_REPLIES`.

**Colors:** the CSS variables at the top of `frontend/static/burry.css` (`--b-crimson`, `--b-gold`, ...).

**Model:** set `OPENROUTER_MODEL` in `.env`. The default, `openrouter/free`, lets OpenRouter pick from its current free models. Free models rotate often and are rate-limited (and some providers may log prompts), so for a live site a low-cost paid model from <https://openrouter.ai/models> gives steadier, better answers. You can also set `OPENROUTER_FALLBACK_MODELS` to a comma-separated list of backups.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Burry isn't configured yet" | `.env` is missing or has no `OPENROUTER_API_KEY`. Restart after editing. |
| "API key was rejected" | Key is wrong or revoked, so create a new one on openrouter.ai. |
| "Can't reach my server" | The Flask server isn't running. Start it (step 4). |
| "Getting a lot of questions" | The free model is rate-limited. Wait a few seconds or switch model. |
| Check the setup quickly | Visit <http://127.0.0.1:5000/api/health> |

## Going live

`python backend/app.py` is a development server. For a public site, host the backend with a production server (e.g. `waitress` on Windows or `gunicorn` on Linux), set `SITE_URL` and `CORS_ORIGINS` in the environment, and keep the API key in the host's environment variables. Never put the key in the HTML or JavaScript.
=======
# Ayaans-Portfolio

