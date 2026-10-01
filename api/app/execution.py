"""Verified request/job identity, explicitly propagated to background threads."""
from __future__ import annotations
import os
import uuid
from pathlib import Path
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, replace
from typing import Literal

@dataclass(frozen=True)
class Execution:
    owner_id: str
    session_id: str
    campaign_id: str | None = None
    thread_id: str | None = None
    mode: Literal["live", "cached"] = "live"

_current: ContextVar[Execution | None] = ContextVar("plotline_execution", default=None)

def fixture_mode() -> bool:
    if os.getenv("PLOTLINE_FIXTURE_MODE") != "1":
        return False
    if os.getenv("NODE_ENV") == "production":
        raise RuntimeError("Fixture identity is forbidden in production")
    return True


def local_preview() -> bool:
    """Explicit no-provider loopback exception; never accepted by hosted runtime."""
    if os.getenv("PLOTLINE_LOCAL_PREVIEW") != "1":
        return False
    from urllib.parse import urlsplit
    origin = urlsplit(os.getenv("PUBLIC_ORIGIN", ""))
    db = urlsplit(os.getenv("DATABASE_URL", ""))
    loopback = ("127.0.0.1", "localhost", "::1")
    forbidden = ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "PIXELBIN_API_TOKEN", "PIXELBIN_TOKEN", "FAL_KEY", "FAL_API_KEY")
    if (os.getenv("NODE_ENV") == "production" or origin.scheme != "http"
        or origin.hostname not in loopback or origin.username or origin.password
        or origin.path not in ("", "/") or origin.query or origin.fragment
        or db.hostname not in loopback or db.scheme not in ("postgres", "postgresql")
        or os.getenv("PLOTLINE_BIND_HOST") != "127.0.0.1"
        or os.getenv("MOCK_LLM") != "1" or os.getenv("MOCK_MEDIA") != "1"
        or any(os.getenv(key) for key in forbidden)):
        raise RuntimeError("Invalid local preview configuration")
    return True

def require_execution() -> Execution:
    actor = _current.get()
    if actor is None and fixture_mode():
        return Execution("00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002")
    if actor is None:
        raise PermissionError("Authentication required")
    return actor

@contextmanager
def execution_scope(actor: Execution):
    for value in (actor.owner_id, actor.session_id):
        if str(uuid.UUID(value)) != value:
            raise PermissionError("Invalid actor")
    if actor.mode not in ("live", "cached"):
        raise PermissionError("Invalid execution mode")
    token = _current.set(actor)
    try:
        yield actor
    finally:
        _current.reset(token)

def is_cached() -> bool:
    return require_execution().mode == "cached"

def require_live_tools() -> Execution:
    actor = require_execution()
    if actor.mode == "cached":
        raise PermissionError("Prepared examples cannot use live services")
    return actor

def for_thread(thread_id: str) -> Execution:
    from app import store
    actor = require_execution()
    thread = store.get_thread(thread_id)
    if not thread:
        raise LookupError("Thread not found")
    series = store.get_series(thread["series_id"])
    if not series:
        raise LookupError("Campaign not found")
    return replace(actor, thread_id=thread_id, campaign_id=thread["series_id"],
                   mode="cached" if series.get("mode") == "cached" else "live")

def active_session(actor: Execution) -> bool:
    if fixture_mode():
        return True
    from app.database import connection
    with connection() as conn:
        return bool(conn.execute("""SELECT 1 FROM sessions s JOIN users u ON u.id=s.owner_id
            WHERE s.id=%s AND s.owner_id=%s AND s.revoked_at IS NULL
              AND s.expires_at>now() AND NOT u.disabled""", (actor.session_id, actor.owner_id)).fetchone())

def owner_directory(kind: str) -> Path:
    from app import config
    if kind not in ("assets", "uploads", "runs"):
        raise ValueError("Invalid private directory")
    actor = require_execution()
    if fixture_mode():
        return {"assets": config.ASSET_DIR, "uploads": config.UPLOAD_DIR, "runs": config.LOG_DIR}[kind]
    root = Path(config.DATA_DIR)
    if root.is_symlink():
        raise PermissionError("Invalid private storage root")
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    current = root
    for segment in ("owners", actor.owner_id, kind):
        current = current / segment
        if current.is_symlink():
            raise PermissionError("Invalid private storage directory")
        current.mkdir(mode=0o700, exist_ok=True)
    return current.resolve()

def owned_file(path: str | Path, kind: str) -> Path:
    root = owner_directory(kind)
    candidate = Path(path)
    if candidate.is_symlink():
        raise PermissionError("Invalid private file")
    resolved = candidate.resolve()
    if root.resolve() not in resolved.parents or not resolved.is_file():
        raise FileNotFoundError("File not found")
    return resolved
