"""Atomic owner/shared spend reservations around each actual provider dispatch."""
from __future__ import annotations
import json
import os
import re
import uuid
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from app.database import connection
from app.execution import active_session, fixture_mode, require_execution, require_live_tools

@dataclass(frozen=True)
class Reservation:
    id: str
    owner_id: str
    fixture: bool = False

def money(value) -> Decimal:
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError):
        raise ValueError("A known maximum cost is required") from None
    if not amount.is_finite() or amount < 0 or amount > 100:
        raise ValueError("Invalid provider cost")
    return amount

def owner_media_limit() -> int:
    value = os.getenv("PLOTLINE_OWNER_MEDIA_LIMIT", "6")
    if not re.fullmatch(r"(?:[1-9]|1[0-9]|20)", value):
        raise ValueError("Invalid media generation allowance")
    return int(value)

def media_capacity() -> dict:
    """Read-only lifetime headroom; reservations remain the atomic authority."""
    actor = require_execution()
    cap = owner_media_limit()
    if fixture_mode():
        return {"owner_limit": cap, "owner_used": 0, "owner_remaining": cap,
                "shared_limit": 20, "shared_remaining": 20, "remaining": cap, "scope": "lifetime"}
    if not active_session(actor):
        raise PermissionError("Session expired")
    with connection(owner_id=actor.owner_id) as conn:
        used = conn.execute("SELECT count(*) AS n FROM usage WHERE owner_id=%s AND kind='media' AND status!='released'", (actor.owner_id,)).fetchone()["n"]
        shared = conn.execute("SELECT media_calls FROM shared_budget WHERE id=1").fetchone()
    if shared is None:
        raise RuntimeError("Shared budget is unavailable")
    left, shared_left = max(0, cap-used), max(0, 20-shared["media_calls"])
    return {"owner_limit": cap, "owner_used": used, "owner_remaining": left,
            "shared_limit": 20, "shared_remaining": shared_left, "remaining": min(left, shared_left), "scope": "lifetime"}

def reserve(*, kind: str, provider: str, model: str, maximum_usd, metadata: dict | None = None) -> Reservation:
    actor = require_live_tools()
    maximum = money(maximum_usd)
    if kind == "media" and maximum != 0:
        raise ValueError("Media uses operation limits; unknown USD conversion cannot be reserved as a quoted price")
    media_cap = owner_media_limit() if kind == "media" else 6
    if not all(isinstance(v, str) and 0 < len(v) <= 120 for v in (kind, provider, model)):
        raise ValueError("Invalid provider metadata")
    # Caller metadata must never include prompt, key, URL, transcript or body.
    allowed = {"input_token_cap", "output_token_cap", "search_call_cap", "resolution", "duration_s", "stage"}
    metadata = metadata or {}
    if set(metadata) - allowed or len(json.dumps(metadata)) > 1024 or any(not isinstance(v, (str, int, float, bool, type(None))) for v in metadata.values()):
        raise ValueError("Unsupported usage metadata")
    reservation = Reservation(str(uuid.uuid4()), actor.owner_id, fixture_mode())
    if reservation.fixture:
        return reservation
    if not active_session(actor):
        raise PermissionError("Session expired")
    owner_cap = money(os.getenv("PLOTLINE_OWNER_BUDGET_USD", "1.00"))
    shared_cap = money(os.getenv("PLOTLINE_SHARED_BUDGET_USD", "5.00"))
    with connection(owner_id=actor.owner_id) as conn:
        # One global short transaction serializes reservations, not inference.
        budget = conn.execute("SELECT committed_usd,active,media_calls FROM shared_budget WHERE id=1 FOR UPDATE").fetchone()
        if budget is None:
            raise RuntimeError("Shared budget is unavailable")
        # Leave room for result checkpoints and failure/audit messages before
        # incurring a provider charge. Database triggers still enforce hard caps.
        headroom = conn.execute("SELECT owner_id,bytes,rows FROM state_quota WHERE owner_id IN (%s,'00000000-0000-0000-0000-000000000000')", (actor.owner_id,)).fetchall()
        for row in headroom:
            shared = str(row["owner_id"]) == "00000000-0000-0000-0000-000000000000"
            if row["bytes"] > (267386880 if shared else 33292288) or row["rows"] > (39800 if shared else 4950):
                raise ValueError("Workspace capacity is too low for another provider result")
        usage = conn.execute("""SELECT coalesce(sum(coalesce(actual_usd,reserved_usd)),0) AS spent,
            count(*) FILTER(WHERE created_at>now()-interval '1 day') AS calls,
            count(*) FILTER(WHERE status IN ('reserved','dispatched')) AS active,
            count(*) FILTER(WHERE kind='media') AS media_calls
            FROM usage WHERE owner_id=%s AND status!='released'""", (actor.owner_id,)).fetchone()
        if kind != "media" and (usage["spent"] + maximum > owner_cap or budget["committed_usd"] + maximum > shared_cap):
            raise ValueError("The application spend limit has been reached")
        if kind == "media" and (usage["media_calls"] >= media_cap or budget["media_calls"] >= 20):
            raise ValueError("The media generation allowance has been reached")
        if usage["calls"] >= 100 or usage["active"] >= 3 or budget["active"] >= 4:
            raise ValueError("Provider request capacity is busy")
        conn.execute("""INSERT INTO usage(id,owner_id,campaign_id,thread_id,kind,provider,model,reserved_usd,status,metadata)
            VALUES(%s,%s,%s,%s,%s,%s,%s,%s,'reserved',%s)""", (reservation.id, actor.owner_id, actor.campaign_id,
            actor.thread_id, kind, provider, model, maximum, json.dumps(metadata)))
        conn.execute("UPDATE shared_budget SET committed_usd=committed_usd+%s,active=active+1,media_calls=media_calls+%s WHERE id=1", (maximum, int(kind == "media")))
    return reservation

def _owner(reservation: Reservation):
    actor = require_execution()
    if actor.owner_id != reservation.owner_id:
        raise PermissionError("Foreign usage reservation")
    if reservation.fixture and not fixture_mode():
        raise PermissionError("Invalid fixture reservation")
    return actor

def dispatch(reservation: Reservation, *, request_sha256: str) -> None:
    actor = _owner(reservation)
    require_live_tools()
    if not re.fullmatch(r"[a-f0-9]{64}", request_sha256):
        raise ValueError("Request fingerprint is required")
    if reservation.fixture:
        return
    if not active_session(actor):
        release(reservation)
        raise PermissionError("Session expired before provider dispatch")
    with connection(owner_id=actor.owner_id) as conn:
        changed = conn.execute("""UPDATE usage SET status='dispatched',request_sha256=%s,updated_at=now()
            WHERE id=%s AND owner_id=%s AND status='reserved' RETURNING id""",
            (request_sha256, reservation.id, actor.owner_id)).fetchone()
        if not changed:
            raise ValueError("Provider attempt already consumed")

def settle(reservation: Reservation, *, actual_usd, input_tokens=None, output_tokens=None,
           cached_input_tokens=None, reasoning_output_tokens=None, provider_job_id=None, consumed_credits=None) -> None:
    actor = _owner(reservation)
    actual = None if actual_usd is None else money(actual_usd)
    credits = None if consumed_credits is None else Decimal(str(consumed_credits))
    if credits is not None and (not credits.is_finite() or not 0 <= credits <= 1_000_000):
        raise ValueError("Invalid provider credits")
    counts = (input_tokens, output_tokens, cached_input_tokens, reasoning_output_tokens)
    if any(v is not None and (not isinstance(v, int) or isinstance(v, bool) or not 0 <= v <= 100_000_000) for v in counts):
        raise ValueError("Invalid usage counts")
    if provider_job_id is not None and (not isinstance(provider_job_id, str) or len(provider_job_id) > 200):
        raise ValueError("Invalid provider receipt")
    if reservation.fixture:
        return
    with connection(owner_id=actor.owner_id) as conn:
        conn.execute("SELECT id FROM shared_budget WHERE id=1 FOR UPDATE")
        row = conn.execute("SELECT * FROM usage WHERE id=%s AND owner_id=%s FOR UPDATE", (reservation.id, actor.owner_id)).fetchone()
        if not row or row["status"] not in ("dispatched", "uncertain", "usage_unavailable"):
            raise ValueError("Usage cannot be settled in this state")
        if row["kind"] == "media" and actual is not None:
            raise ValueError("Media USD conversion is unknown")
        # Keep even a provider's unexpected overage honest; future reservations
        # see it. Never discard already-billed usage because a cap was exceeded.
        if actual is not None:
            conn.execute("UPDATE shared_budget SET committed_usd=committed_usd+%s WHERE id=1",
                         (actual - (row["actual_usd"] if row["actual_usd"] is not None else row["reserved_usd"]),))
        if row["status"] == "dispatched":
            conn.execute("UPDATE shared_budget SET active=active-1 WHERE id=1")
        conn.execute("""UPDATE usage SET actual_usd=%s,status=%s,input_tokens=%s,output_tokens=%s,
            cached_input_tokens=%s,reasoning_output_tokens=%s,provider_job_id=%s,consumed_credits=%s,updated_at=now()
            WHERE id=%s AND owner_id=%s""", (actual, "complete" if actual is not None else "usage_unavailable",
            *counts, provider_job_id, credits, reservation.id, actor.owner_id))

def uncertain(reservation: Reservation, *, provider_job_id=None, reason="transport_unknown") -> None:
    actor = _owner(reservation)
    if reason not in ("transport_unknown", "provider_rejected", "usage_missing", "response_invalid"):
        reason = "transport_unknown"
    if provider_job_id is not None and (not isinstance(provider_job_id, str) or len(provider_job_id) > 200):
        raise ValueError("Invalid provider receipt")
    if reservation.fixture:
        return
    with connection(owner_id=actor.owner_id) as conn:
        conn.execute("SELECT id FROM shared_budget WHERE id=1 FOR UPDATE")
        # Never overwrite known settled usage after a downstream parse failure.
        changed = conn.execute("""UPDATE usage SET status='uncertain',reason=%s,provider_job_id=coalesce(%s,provider_job_id),updated_at=now()
            WHERE id=%s AND owner_id=%s AND status='dispatched' RETURNING id""", (reason, provider_job_id, reservation.id, actor.owner_id)).fetchone()
        if changed:
            conn.execute("UPDATE shared_budget SET active=active-1 WHERE id=1")

def release(reservation: Reservation) -> None:
    actor = _owner(reservation)
    if reservation.fixture:
        return
    with connection(owner_id=actor.owner_id) as conn:
        conn.execute("SELECT id FROM shared_budget WHERE id=1 FOR UPDATE")
        row = conn.execute("""UPDATE usage SET status='released',updated_at=now()
            WHERE id=%s AND owner_id=%s AND status='reserved' RETURNING reserved_usd,kind""", (reservation.id, actor.owner_id)).fetchone()
        if not row:
            raise ValueError("A dispatched reservation cannot be released")
        conn.execute("UPDATE shared_budget SET committed_usd=committed_usd-%s,active=active-1,media_calls=media_calls-%s WHERE id=1", (row["reserved_usd"], int(row["kind"] == "media")))
