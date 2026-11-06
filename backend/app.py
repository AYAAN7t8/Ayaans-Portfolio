"""
Burry - portfolio chatbot backend.

Flask server that
  * serves the portfolio page (frontend/index.html) at http://127.0.0.1:5000
  * exposes POST /api/chat, which forwards the conversation to OpenRouter and
    streams Burry's reply back to the browser (Server-Sent Events)

The OpenRouter API key stays on the server (in .env) and is never sent to the
browser.  Built for Python 3.11.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
from collections import defaultdict, deque
from pathlib import Path

import requests
from dotenv import load_dotenv
from flask import Flask, Response, abort, jsonify, request, send_from_directory, stream_with_context
from werkzeug.middleware.proxy_fix import ProxyFix

# Make "knowledge" importable no matter which folder the server is started from
# (e.g. gunicorn on Render runs from the project root).
sys.path.insert(0, str(Path(__file__).resolve().parent))

from knowledge import build_system_prompt  # noqa: E402

# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #

ROOT_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = ROOT_DIR / "frontend"

load_dotenv(ROOT_DIR / ".env")  # local only; on Render, set variables in the dashboard

# The portfolio page can live at the project root or in frontend/.
INDEX_DIR = next(
    (d for d in (FRONTEND_DIR, ROOT_DIR) if (d / "index.html").is_file()),
    ROOT_DIR,
)


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


OPENROUTER_API_KEY = _env("OPENROUTER_API_KEY")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# "openrouter/free" lets OpenRouter pick from its current free models.
# Free model IDs change often, so swap this in .env for any model you prefer,
# e.g. a paid one for faster, steadier answers.
MODEL = _env("OPENROUTER_MODEL", "openrouter/free")
FALLBACK_MODELS = [m.strip() for m in _env("OPENROUTER_FALLBACK_MODELS").split(",") if m.strip()]

# Render sets RENDER_EXTERNAL_URL automatically (e.g. https://your-app.onrender.com).
SITE_URL = _env("SITE_URL") or _env("RENDER_EXTERNAL_URL") or "http://127.0.0.1:5000"
SITE_TITLE = _env("SITE_TITLE", "Burry - Portfolio Assistant")

TEMPERATURE = float(_env("TEMPERATURE", "0.5"))
MAX_TOKENS = int(_env("MAX_TOKENS", "500"))

MAX_HISTORY = 12              # most recent messages forwarded to the model
MAX_MESSAGE_CHARS = 1500      # per-message cap, protects your API credits
RATE_LIMIT_PER_MINUTE = int(_env("RATE_LIMIT_PER_MINUTE", "20"))

# Origins allowed to call the API from another port (e.g. VS Code Live Server).
ALLOWED_ORIGINS = {
    o.strip()
    for o in _env(
        "CORS_ORIGINS",
        "http://127.0.0.1:5500,http://localhost:5500,http://127.0.0.1:5000,http://localhost:5000",
    ).split(",")
    if o.strip()
}

SYSTEM_PROMPT = build_system_prompt()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("burry")

app = Flask(__name__, static_folder=str(FRONTEND_DIR / "static"), static_url_path="/static")
# Render (and most hosts) sit behind a proxy: trust its X-Forwarded-* headers so
# request.remote_addr is the real visitor IP (needed for the rate limiter).
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)


# --------------------------------------------------------------------------- #
# CORS (tiny hand-rolled version so no extra dependency is needed)
# --------------------------------------------------------------------------- #

@app.after_request
def add_cors_headers(resp: Response) -> Response:
    origin = request.headers.get("Origin", "")
    if origin and ("*" in ALLOWED_ORIGINS or origin in ALLOWED_ORIGINS):
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Vary"] = "Origin"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return resp


# --------------------------------------------------------------------------- #
# Simple in-memory rate limiter (per client IP)
# --------------------------------------------------------------------------- #

_hits: dict[str, deque[float]] = defaultdict(deque)


def rate_limited(ip: str) -> bool:
    now = time.monotonic()
    window = _hits[ip]
    while window and now - window[0] > 60:
        window.popleft()
    if len(window) >= RATE_LIMIT_PER_MINUTE:
        return True
    window.append(now)
    return False


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def clean_messages(payload) -> list[dict[str, str]]:
    """Validate the browser's messages and keep only the recent, well-formed ones."""
    if not isinstance(payload, dict) or not isinstance(payload.get("messages"), list):
        raise ValueError("Request must include a 'messages' list.")

    cleaned: list[dict[str, str]] = []
    for m in payload["messages"]:
        if not isinstance(m, dict):
            continue
        role, content = m.get("role"), m.get("content")
        if role not in ("user", "assistant") or not isinstance(content, str):
            continue
        content = content.strip()[:MAX_MESSAGE_CHARS]
        if content:
            cleaned.append({"role": role, "content": content})

    cleaned = cleaned[-MAX_HISTORY:]
    # The conversation must start with, and end on, a visitor message.
    while cleaned and cleaned[0]["role"] != "user":
        cleaned.pop(0)
    if not cleaned or cleaned[-1]["role"] != "user":
        raise ValueError("The last message must be from the user.")
    return cleaned


def sse(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


def friendly_error(status: int | None) -> str:
    if status == 401:
        return "Burry's API key was rejected. The site owner needs to check the OpenRouter key."
    if status == 402:
        return "Burry has run out of OpenRouter credits right now. Please try again later."
    if status == 429:
        return "Burry is getting a lot of questions at the moment. Please try again in a few seconds."
    return "Burry had trouble reaching the AI service. Please try again in a moment."


def open_upstream(messages: list[dict[str, str]]) -> requests.Response:
    body: dict = {
        "messages": [{"role": "system", "content": SYSTEM_PROMPT}, *messages],
        "stream": True,
        "temperature": TEMPERATURE,
        "max_tokens": MAX_TOKENS,
    }
    if FALLBACK_MODELS:
        body["models"] = [MODEL, *FALLBACK_MODELS]   # OpenRouter tries them in order
    else:
        body["model"] = MODEL

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": SITE_URL,   # optional: attribution on openrouter.ai
        "X-Title": SITE_TITLE,      # optional
    }
    return requests.post(OPENROUTER_URL, headers=headers, json=body, stream=True, timeout=(10, 60))


def stream_reply(upstream: requests.Response):
    """Translate OpenRouter's SSE stream into small {'delta': '...'} events."""
    # SSE has no charset header, so requests would guess Latin-1 and garble emoji/Urdu.
    upstream.encoding = "utf-8"
    try:
        for raw in upstream.iter_lines(decode_unicode=True):
            line = (raw or "").strip()
            if not line.startswith("data:"):      # blank lines and ": OPENROUTER PROCESSING" keep-alives
                continue
            data = line[5:].strip()
            if data == "[DONE]":
                break
            try:
                chunk = json.loads(data)
            except json.JSONDecodeError:
                continue
            if chunk.get("error"):
                log.warning("OpenRouter stream error: %s", chunk["error"])
                yield sse({"error": friendly_error(None)})
                return
            choices = chunk.get("choices") or []
            if not choices:
                continue
            text = (choices[0].get("delta") or {}).get("content")
            if text:
                yield sse({"delta": text})
        yield sse({"done": True})
    except requests.RequestException as exc:
        log.warning("Stream interrupted: %s", exc)
        yield sse({"error": friendly_error(None)})
    finally:
        upstream.close()


# --------------------------------------------------------------------------- #
# Routes
# --------------------------------------------------------------------------- #

@app.get("/")
def home():
    if not (INDEX_DIR / "index.html").is_file():
        abort(404)
    return send_from_directory(INDEX_DIR, "index.html")


@app.get("/api/health")
def health():
    return jsonify(
        status="ok",
        assistant="Burry",
        model=MODEL,
        api_key_configured=bool(OPENROUTER_API_KEY),
    )


@app.route("/api/chat", methods=["POST", "OPTIONS"])
def chat():
    if request.method == "OPTIONS":
        return ("", 204)

    if not OPENROUTER_API_KEY:
        log.error("OPENROUTER_API_KEY is missing. Add it to .env (local) or Render's Environment settings.")
        return jsonify(error="Burry isn't configured yet. The site owner needs to add an OpenRouter API key."), 503

    if rate_limited(request.remote_addr or "unknown"):
        return jsonify(error="You're sending messages quickly. Please wait a few seconds and try again."), 429

    try:
        messages = clean_messages(request.get_json(silent=True))
    except ValueError as exc:
        return jsonify(error=str(exc)), 400

    try:
        upstream = open_upstream(messages)
    except requests.RequestException as exc:
        log.warning("Could not reach OpenRouter: %s", exc)
        return jsonify(error=friendly_error(None)), 502

    if upstream.status_code != 200:
        log.warning("OpenRouter returned %s: %s", upstream.status_code, upstream.text[:300])
        status = upstream.status_code
        upstream.close()
        return jsonify(error=friendly_error(status)), (429 if status == 429 else 502)

    return Response(
        stream_with_context(stream_reply(upstream)),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


if __name__ == "__main__":
    # Local development only. On Render the app is started by gunicorn (see render.yaml).
    port = int(_env("PORT", "5000"))
    host = _env("HOST", "127.0.0.1")
    if not OPENROUTER_API_KEY:
        log.warning("No OPENROUTER_API_KEY found - copy .env.example to .env and add your key.")
    log.info("Burry is running at http://%s:%s  (model: %s)", host, port, MODEL)
    app.run(host=host, port=port, debug=_env("FLASK_DEBUG", "1") == "1")
