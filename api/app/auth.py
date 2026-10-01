"""Authenticate the private API through a request-bound, revocable Next bridge."""
from __future__ import annotations
import base64
import hashlib
import hmac
import json
import os
import time
import uuid
from dataclasses import replace
from starlette.responses import JSONResponse
from app.database import connection
from app.execution import Execution, execution_scope, fixture_mode

def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))

def secret() -> bytes:
    value = os.getenv("PLOTLINE_BRIDGE_SECRET", "")
    if len(value) < 32:
        raise RuntimeError("Internal authentication is not configured")
    return value.encode()

def verify_binding(token: str, method: str, path: str, body: bytes) -> Execution:
    if not token or len(token) > 4096:
        raise PermissionError("Authentication required")
    try:
        encoded, signature = token.split(".")
        expected = hmac.new(secret(), encoded.encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(_decode(signature), expected):
            raise ValueError()
        data = json.loads(_decode(encoded))
        now = int(time.time())
        if set(data) != {"v", "owner_id", "session_id", "nonce", "iat", "exp", "method", "path", "sha256"}:
            raise ValueError()
        if data["v"] != 1 or type(data["iat"]) is not int or type(data["exp"]) is not int:
            raise ValueError()
        if not now - 35 <= data["iat"] <= now + 3 or not now < data["exp"] <= data["iat"] + 30:
            raise ValueError()
        if data["method"] != method or data["path"] != path or not hmac.compare_digest(data["sha256"], hashlib.sha256(body).hexdigest()):
            raise ValueError()
        for key in ("owner_id", "session_id", "nonce"):
            if str(uuid.UUID(data[key])) != data[key]:
                raise ValueError()
    except (ValueError, TypeError, KeyError):
        raise PermissionError("Authentication required") from None
    with connection() as conn:
        session = conn.execute("""SELECT 1 FROM sessions s JOIN users u ON u.id=s.owner_id
          WHERE s.id=%s AND s.owner_id=%s AND s.revoked_at IS NULL
          AND s.expires_at>now() AND NOT u.disabled""", (data["session_id"], data["owner_id"])).fetchone()
        if not session:
            raise PermissionError("Authentication required")
        conn.execute("DELETE FROM bridge_nonces WHERE expires_at<now()")
        if conn.execute("SELECT count(*) AS n FROM bridge_nonces").fetchone()["n"] >= 20000:
            raise PermissionError("Request capacity exceeded")
        if not conn.execute("""INSERT INTO bridge_nonces(id,owner_id,expires_at) VALUES(%s,%s,to_timestamp(%s))
          ON CONFLICT DO NOTHING RETURNING id""", (data["nonce"], data["owner_id"], data["exp"])).fetchone():
            raise PermissionError("Request replay rejected")
    return Execution(data["owner_id"], data["session_id"])

async def middleware(request, call_next):
    if fixture_mode() or request.url.path in ("/health", "/healthz"):
        return await call_next(request)
    if not request.url.path.startswith("/api/"):
        return JSONResponse({"error": "not_found"}, 404)
    maximum = 16 * 1024 * 1024 if request.url.path == "/api/uploads" else 512 * 1024
    try:
        if int(request.headers.get("content-length") or 0) > maximum:
            return JSONResponse({"error": "request_too_large"}, 413)
        chunks, length = [], 0
        async for chunk in request.stream():
            length += len(chunk)
            if length > maximum:
                return JSONResponse({"error": "request_too_large"}, 413)
            chunks.append(chunk)
        body = b"".join(chunks)
        # Preserve bounded bytes for FastAPI's JSON/multipart parser after auth.
        request._body = body
        path = request.url.path + ("?" + request.url.query if request.url.query else "")
        actor = verify_binding(request.headers.get("x-plotline-actor", ""), request.method, path, body)
        with execution_scope(actor):
            from app import store
            from app.execution import for_thread
            parts = request.url.path.strip("/").split("/")
            if len(parts) >= 3:
                resource, identifier = parts[1:3]
                getters = {"campaigns": store.get_series, "threads": store.get_thread,
                           "assets": store.get_asset, "ad-cards": store.get_ad_card,
                           "canon": store.get_canon_sheet}
                if resource in getters:
                    row = getters[resource](identifier)
                    if not row:
                        raise LookupError("Resource not found")
                    if resource == "threads":
                        actor = for_thread(identifier)
                    elif resource == "campaigns":
                        actor = replace(actor, campaign_id=identifier, mode="cached" if row.get("mode") == "cached" else "live")
            with execution_scope(actor):
                return await call_next(request)
    except PermissionError:
        return JSONResponse({"error": "authentication_required"}, 401)
    except LookupError:
        return JSONResponse({"error": "not_found"}, 404)
    except (ValueError, TypeError):
        return JSONResponse({"error": "invalid_request"}, 400)
    except Exception:
        return JSONResponse({"error": "service_unavailable", "message": "The campaign service is unavailable."}, 503)
