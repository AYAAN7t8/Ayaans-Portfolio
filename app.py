"""
Entry point for hosts that run `gunicorn app:app` from the project root
(Render's default start command). The real Flask app lives in backend/app.py.
"""

import importlib.util
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "burry_backend", Path(__file__).resolve().parent / "backend" / "app.py"
)
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)

app = _module.app
