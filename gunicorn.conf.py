# Gunicorn picks this file up automatically when started from the project root,
# so even Render's default `gunicorn app:app` gets settings that suit streaming chat.
import os

bind = f"0.0.0.0:{os.environ.get('PORT', '10000')}"
worker_class = "gthread"   # threads let several visitors stream replies at once
workers = int(os.environ.get("WEB_CONCURRENCY", "2"))
threads = 8
timeout = 120
