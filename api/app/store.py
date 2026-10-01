"""Owner-scoped PostgreSQL; SQLite is only an explicit local test fixture."""
from __future__ import annotations

import json
import sqlite3
import threading
import time
import uuid
import hashlib
import mimetypes
from pathlib import Path
from contextvars import ContextVar
from typing import Any, Optional

from app import config
from app.execution import fixture_mode, require_execution, owner_directory, owned_file, local_preview
from app.database import connection

_fixture_lock = threading.RLock()
_transaction: ContextVar[Any] = ContextVar("plotline_store_transaction", default=None)
_transaction_exit: ContextVar[Any] = ContextVar("plotline_store_exit", default=None)
_conn: Optional[sqlite3.Connection] = None


class _Postgres:
    """Translate DB-API parameter markers only; ownership is enforced by RLS."""
    def __init__(self, conn):
        self.conn = conn

    def execute(self, sql, params=()):
        return self.conn.execute(sql.replace("?", "%s"), params)

    def commit(self):
        # The whole helper commits on scope exit. Never clear SET LOCAL early.
        pass


class _Scope:
    def __enter__(self):
        if fixture_mode():
            return _fixture_lock.__enter__()
        actor = require_execution()
        if _transaction.get() is not None:
            raise RuntimeError("Nested store transaction")
        cm = connection(owner_id=actor.owner_id)
        conn = cm.__enter__()
        try:
            # Serializes per-owner sequence assignment across API workers.
            conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))", (actor.owner_id,))
        except BaseException:
            import sys
            cm.__exit__(*sys.exc_info())
            raise
        token = _transaction.set(_Postgres(conn))
        _transaction_exit.set((cm, token))
        return self

    def __exit__(self, typ, value, tb):
        if fixture_mode():
            return _fixture_lock.__exit__(typ, value, tb)
        cm, token = _transaction_exit.get()
        try:
            return cm.__exit__(typ, value, tb)
        finally:
            _transaction.reset(token)
            _transaction_exit.set(None)


_lock = _Scope()


def get_conn() -> sqlite3.Connection:
    if not fixture_mode():
        require_execution()
        if _transaction.get() is None:
            raise RuntimeError("A scoped store transaction is required")
        return _transaction.get()
    global _conn
    if _conn is None:
        _conn = sqlite3.connect(config.DB_PATH, check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _init(_conn)
    return _conn


def _init(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS profile (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            data TEXT NOT NULL DEFAULT '{}'
        );
        INSERT OR IGNORE INTO profile (id, data) VALUES (1, '{}');

        CREATE TABLE IF NOT EXISTS series (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'context_ready',
            context TEXT NOT NULL,
            created_at REAL NOT NULL
        );

        -- Per-campaign settings. A SEPARATE TABLE rather than a column on
        -- `series` on purpose: CREATE TABLE IF NOT EXISTS upgrades an existing
        -- dev database for free, where adding a column would need an ALTER and
        -- a migration path this project does not have yet.
        -- v3 holds `seats` here; the ReviewPolicy gates and counts land in the
        -- same blob at build-order step 2, so this stays one primitive.
        CREATE TABLE IF NOT EXISTS campaign_settings (
            series_id TEXT PRIMARY KEY,
            data TEXT NOT NULL DEFAULT '{}',
            updated_at REAL
        );

        -- Stage-level checkpoints. A rumination is a chain of expensive LLM
        -- calls whose intermediate results used to live only in memory, so ONE
        -- failure anywhere discarded every node that had already succeeded and
        -- been paid for. Observed live: planner 209s plus three reviews at
        -- 120-139s all succeeded, then the last node's connection dropped and
        -- all four were binned.
        CREATE TABLE IF NOT EXISTS run_checkpoints (
            thread_id TEXT NOT NULL,
            stage TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at REAL NOT NULL,
            PRIMARY KEY (thread_id, stage)
        );

        -- Canon sheets are WORKSPACE-GLOBAL (owner decision 2026-08-25), not
        -- campaign-scoped: that is the retention mechanic, since campaign two is
        -- cheaper precisely because these already exist. `first_campaign_id` is
        -- provenance, never ownership.
        CREATE TABLE IF NOT EXISTS canon_sheets (
            id TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            label TEXT NOT NULL,
            data TEXT NOT NULL,
            first_campaign_id TEXT,
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS series_plan (
            series_id TEXT PRIMARY KEY,
            version INTEGER NOT NULL DEFAULT 1,
            plan TEXT,
            feedback TEXT,
            options TEXT,
            updated_at REAL
        );

        CREATE TABLE IF NOT EXISTS concept_state (
            series_id TEXT NOT NULL,
            concept_id TEXT NOT NULL,
            status TEXT NOT NULL,
            ccs INTEGER,
            order_idx INTEGER NOT NULL,
            regen_count INTEGER NOT NULL DEFAULT 0,
            approved INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (series_id, concept_id)
        );

        CREATE TABLE IF NOT EXISTS pipeline_runs (
            id TEXT PRIMARY KEY,
            series_id TEXT NOT NULL,
            kind TEXT NOT NULL,
            status TEXT NOT NULL,
            error TEXT,
            created_at REAL NOT NULL,
            finished_at REAL
        );

        CREATE TABLE IF NOT EXISTS performance_log (
            id TEXT PRIMARY KEY,
            series_id TEXT,
            concept_id TEXT,
            platform TEXT,
            metrics TEXT NOT NULL,
            pasted_at REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS uploads (
            id TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            kind TEXT NOT NULL,
            path TEXT NOT NULL,
            content_type TEXT,
            series_id TEXT,
            created_at REAL NOT NULL
        );

        -- Addendum-01 §01/§03: chat-first threads. Ordinals are per-series,
        -- assigned at creation, never reused or renumbered on delete.
        CREATE TABLE IF NOT EXISTS threads (
            id TEXT PRIMARY KEY,
            series_id TEXT NOT NULL,
            ordinal INTEGER NOT NULL,
            kind TEXT NOT NULL DEFAULT 'planning',
            stage TEXT NOT NULL DEFAULT 'inspiration',
            chosen_formats TEXT,
            created_at REAL NOT NULL,
            UNIQUE (series_id, ordinal)
        );

        CREATE TABLE IF NOT EXISTS thread_messages (
            id TEXT PRIMARY KEY,
            thread_id TEXT NOT NULL,
            seq INTEGER NOT NULL,
            role TEXT NOT NULL,             -- 'agent' | 'user'
            envelope TEXT NOT NULL,         -- AgentMessage or UserEvent JSON
            created_at REAL NOT NULL,
            UNIQUE (thread_id, seq)
        );

        -- Per-artifact version history, rendered in the panel's Activity tab.
        CREATE TABLE IF NOT EXISTS artifact_activity (
            id TEXT PRIMARY KEY,
            thread_id TEXT NOT NULL,
            artifact_id TEXT NOT NULL,
            event TEXT NOT NULL,            -- proposed | downgraded | refined | approved | …
            detail TEXT,
            created_at REAL NOT NULL
        );

        -- Addendum-02 §04: Post Cards — one object by id, three surfaces.
        CREATE TABLE IF NOT EXISTS post_cards (
            id TEXT PRIMARY KEY,
            series_id TEXT NOT NULL,
            thread_id TEXT NOT NULL,
            concept_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'ready',
            data TEXT NOT NULL,
            posted_at REAL,
            created_at REAL NOT NULL
        );

        -- Addendum-03 §Step 8: Ad Cards — the campaign deliverable. A campaign
        -- IS a series row, so campaign_id is a series id; variant sets share a
        -- variant_group_id and differ by variant_id.
        CREATE TABLE IF NOT EXISTS ad_cards (
            id TEXT PRIMARY KEY,
            campaign_id TEXT NOT NULL,
            thread_id TEXT NOT NULL,
            option_id TEXT NOT NULL,
            variant_group_id TEXT,
            variant_id TEXT,
            status TEXT NOT NULL DEFAULT 'draft',
            data TEXT NOT NULL,
            created_at REAL NOT NULL
        );

        -- Generated assets (mock or fal) + full generation audit trail.
        CREATE TABLE IF NOT EXISTS assets (
            id TEXT PRIMARY KEY,
            thread_id TEXT,
            slot TEXT,
            kind TEXT NOT NULL,
            path TEXT NOT NULL,
            params TEXT NOT NULL DEFAULT '{}',
            status TEXT NOT NULL DEFAULT 'ready',
            cost REAL NOT NULL DEFAULT 0,
            created_at REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS generation_log (
            id TEXT PRIMARY KEY,
            thread_id TEXT,
            asset_id TEXT,
            event TEXT NOT NULL,            -- generate | reroll | seam_qa | edit_prompt | …
            prompt TEXT,
            model TEXT,
            seed TEXT,
            cost REAL DEFAULT 0,
            created_at REAL NOT NULL
        );
        """
    )
    # Addendum-01/02 migrations on existing dev DBs.
    cols = {r[1] for r in conn.execute("PRAGMA table_info(concept_state)").fetchall()}
    if "coverage" not in cols:
        conn.execute("ALTER TABLE concept_state ADD COLUMN coverage INTEGER")
    if "production_status" not in cols:
        # Plans slot lifecycle (§01): planned | in_production | ready | posted
        conn.execute("ALTER TABLE concept_state ADD COLUMN production_status TEXT DEFAULT 'planned'")
    # Addendum-03: variant columns for dev DBs whose ad_cards predates them.
    ad_cols = {r[1] for r in conn.execute("PRAGMA table_info(ad_cards)").fetchall()}
    for col in ("variant_group_id", "variant_id"):
        if col not in ad_cols:
            conn.execute(f"ALTER TABLE ad_cards ADD COLUMN {col} TEXT")
    series_cols = {r[1] for r in conn.execute("PRAGMA table_info(series)").fetchall()}
    if "mode" not in series_cols:
        conn.execute("ALTER TABLE series ADD COLUMN mode TEXT NOT NULL DEFAULT 'live'")
    for table in ("assets", "uploads"):
        if "storage_ref" not in {r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN storage_ref TEXT")
    conn.commit()


def _now() -> float:
    return time.time()


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


# ----------------------------------------------------------------- profile --


def get_profile() -> dict[str, Any]:
    with _lock:
        row = get_conn().execute("SELECT data FROM profile WHERE id = 1").fetchone()
    return json.loads(row["data"]) if row else {}


def save_profile(data: dict[str, Any]) -> None:
    with _lock:
        if fixture_mode():
            get_conn().execute("UPDATE profile SET data = ? WHERE id = 1", (json.dumps(data),))
        else:
            get_conn().execute("INSERT INTO profile(id,data) VALUES(1,?) ON CONFLICT(owner_id,id) DO UPDATE SET data=excluded.data", (json.dumps(data),))
        get_conn().commit()


# ------------------------------------------------------------------ series --


def create_series(context: dict[str, Any]) -> str:
    series_id = new_id("srs")
    with _lock:
        get_conn().execute(
            "INSERT INTO series (id, name, status, context, created_at) VALUES (?,?,?,?,?)",
            (series_id, context.get("name", "Untitled"), "context_ready", json.dumps(context), _now()),
        )
        get_conn().commit()
    return series_id


def update_series_context(series_id: str, context: dict[str, Any]) -> None:
    with _lock:
        get_conn().execute(
            "UPDATE series SET context = ?, name = ? WHERE id = ?",
            (json.dumps(context), context.get("name", "Untitled"), series_id),
        )
        get_conn().commit()


def set_series_status(series_id: str, status: str) -> None:
    with _lock:
        get_conn().execute("UPDATE series SET status = ? WHERE id = ?", (status, series_id))
        get_conn().commit()


def get_series(series_id: str) -> Optional[dict[str, Any]]:
    with _lock:
        row = get_conn().execute("SELECT * FROM series WHERE id = ?", (series_id,)).fetchone()
    if not row:
        return None
    return {
        "id": row["id"],
        "name": row["name"],
        "status": row["status"],
        "context": json.loads(row["context"]),
        "created_at": row["created_at"],
        "mode": row["mode"],
    }


def list_series() -> list[dict[str, Any]]:
    with _lock:
        rows = get_conn().execute("SELECT * FROM series ORDER BY created_at DESC").fetchall()
    out = []
    for row in rows:
        states = get_concept_states(row["id"])
        out.append(
            {
                "id": row["id"],
                "name": row["name"],
                "status": row["status"],
                "context": json.loads(row["context"]),
                "created_at": row["created_at"],
                "mode": row["mode"],
                "concept_total": len(states),
                "concept_approved": sum(1 for s in states if s["approved"]),
            }
        )
    return out


# ------------------------------------------------ canon library (v3 §6) --


def save_canon_sheet(sheet: dict[str, Any], campaign_id: Optional[str] = None) -> None:
    """Upsert. A sheet keeps its original provenance on re-save — the second
    campaign to use it did not create it."""
    if not fixture_mode():
        if campaign_id and not get_series(campaign_id):
            raise ValueError("Campaign not found")
        asset_ids = list(sheet.get("asset_ids") or []) + [sheet.get(name) for name in ("sheet_asset_id", "anchor_asset_id") if sheet.get(name)]
        if len(asset_ids) > 64 or any(not isinstance(value, str) or not get_asset(value) for value in asset_ids):
            raise ValueError("Asset not found")
    now = _now()
    conflict = "id" if fixture_mode() else "owner_id,id"
    with _lock:
        get_conn().execute(
            "INSERT INTO canon_sheets (id, kind, label, data, first_campaign_id, created_at, updated_at) "
            f"VALUES (?,?,?,?,?,?,?) ON CONFLICT({conflict}) DO UPDATE SET "
            "kind=excluded.kind, label=excluded.label, data=excluded.data, updated_at=excluded.updated_at",
            (sheet["id"], sheet["kind"], sheet.get("label", sheet["id"]),
             json.dumps(sheet), campaign_id, now, now),
        )
        get_conn().commit()


def get_canon_sheet(sheet_id: str) -> Optional[dict[str, Any]]:
    with _lock:
        row = get_conn().execute(
            "SELECT data FROM canon_sheets WHERE id = ?", (sheet_id,)).fetchone()
    return json.loads(row["data"]) if row else None


def list_canon_sheets(kind: Optional[str] = None) -> list[dict[str, Any]]:
    sql = "SELECT data, first_campaign_id, updated_at FROM canon_sheets"
    args: tuple = ()
    if kind:
        sql += " WHERE kind = ?"
        args = (kind,)
    sql += " ORDER BY updated_at DESC"
    with _lock:
        rows = get_conn().execute(sql, args).fetchall()
    out = []
    for r in rows:
        sheet = json.loads(r["data"])
        sheet["_first_campaign_id"] = r["first_campaign_id"]
        sheet["_updated_at"] = r["updated_at"]
        out.append(sheet)
    return out


def delete_canon_sheet(sheet_id: str) -> bool:
    with _lock:
        cur = get_conn().execute("DELETE FROM canon_sheets WHERE id = ?", (sheet_id,))
        get_conn().commit()
    return cur.rowcount > 0


# Everything that hangs off a campaign, and by which key. Written as data
# rather than a run of DELETEs so a new table is one line here instead of a
# silent orphan — the failure mode of a hand-written cascade is that it keeps
# working while quietly leaving rows behind.
_BY_THREAD = ("run_checkpoints", "thread_messages", "artifact_activity",
              "assets", "generation_log")
_BY_SERIES = ("campaign_settings", "series_plan", "concept_state",
              "pipeline_runs", "performance_log", "post_cards")


def delete_series(series_id: str) -> dict[str, int]:
    """Delete a campaign and everything hanging off it. Returns per-table counts.

    canon_sheets are deliberately NOT touched: they were made workspace-global
    by owner decision on 2026-08-25, so they outlive the campaign that produced
    them and deleting one here would silently strip the shared library.
    """
    counts: dict[str, int] = {}
    with _lock:
        conn = get_conn()
        retained_assets = set()
        for row in conn.execute("SELECT data FROM canon_sheets").fetchall():
            sheet = json.loads(row["data"])
            retained_assets.update(sheet.get("asset_ids") or [])
            retained_assets.update(sheet.get(key) for key in ("sheet_asset_id", "anchor_asset_id") if sheet.get(key))
        threads = [r["id"] for r in conn.execute(
            "SELECT id FROM threads WHERE series_id = ?", (series_id,)).fetchall()]
        if threads:
            marks = ",".join("?" * len(threads))
            for table in _BY_THREAD:
                if table in ("assets", "generation_log"):
                    continue
                cur = conn.execute(f"DELETE FROM {table} WHERE thread_id IN ({marks})", threads)
                counts[table] = cur.rowcount
            if retained_assets:
                placeholders = ",".join("?" * len(retained_assets))
                conn.execute(f"UPDATE assets SET thread_id=NULL WHERE thread_id IN ({marks}) AND id IN ({placeholders})", [*threads, *retained_assets])
            counts["assets"] = conn.execute(f"DELETE FROM assets WHERE thread_id IN ({marks})", threads).rowcount
            # Charges and generation receipts remain private to the owner even
            # when a campaign is deleted; canon-referenced files stay reusable.
            conn.execute(f"UPDATE generation_log SET thread_id=NULL WHERE thread_id IN ({marks})", threads)
        for table in _BY_SERIES:
            cur = conn.execute(f"DELETE FROM {table} WHERE series_id = ?", (series_id,))
            counts[table] = cur.rowcount
        counts["ad_cards"] = conn.execute(
            "DELETE FROM ad_cards WHERE campaign_id = ?", (series_id,)).rowcount
        counts["threads"] = conn.execute(
            "DELETE FROM threads WHERE series_id = ?", (series_id,)).rowcount
        conn.execute("UPDATE uploads SET series_id=NULL WHERE series_id=?", (series_id,))
        counts["series"] = conn.execute(
            "DELETE FROM series WHERE id = ?", (series_id,)).rowcount
        conn.commit()
    return {k: v for k, v in counts.items() if v}


def mark_cached_example(series_id: str) -> None:
    """Trusted factory only; no generic request field can change this column."""
    with _lock:
        get_conn().execute("UPDATE series SET mode='cached' WHERE id=?", (series_id,))
        get_conn().commit()


# ------------------------------------------------- run checkpoints (v3) --


def save_checkpoint(thread_id: str, stage: str, data: dict[str, Any]) -> None:
    with _lock:
        get_conn().execute(
            "INSERT INTO run_checkpoints (thread_id, stage, data, created_at) VALUES (?,?,?,?) "
            "ON CONFLICT(thread_id, stage) DO UPDATE SET data = excluded.data, "
            "created_at = excluded.created_at",
            (thread_id, stage, json.dumps(data, default=str), _now()),
        )
        get_conn().commit()


def load_checkpoint(thread_id: str, stage: str) -> Optional[dict[str, Any]]:
    with _lock:
        row = get_conn().execute(
            "SELECT data FROM run_checkpoints WHERE thread_id = ? AND stage = ?",
            (thread_id, stage),
        ).fetchone()
    if not row:
        return None
    try:
        return json.loads(row["data"])
    except (TypeError, ValueError):
        return None


def clear_checkpoints(thread_id: str) -> None:
    """Called when a NEW rumination starts. A checkpoint from a previous run is
    stale by definition — resuming into it would silently serve the user the
    campaign they already rejected."""
    with _lock:
        get_conn().execute("DELETE FROM run_checkpoints WHERE thread_id = ? AND stage != '_last_job'", (thread_id,))
        get_conn().commit()


# -------------------------------------------------- campaign settings (v3) --


def get_campaign_settings(series_id: str) -> dict[str, Any]:
    """Never None. A campaign with no row has default settings, and defaults
    must reproduce today's behaviour exactly — an absent settings row can never
    mean an absent capability."""
    with _lock:
        row = get_conn().execute(
            "SELECT data FROM campaign_settings WHERE series_id = ?", (series_id,)
        ).fetchone()
    if not row:
        return {}
    try:
        return json.loads(row["data"]) or {}
    except (TypeError, ValueError):
        return {}


def update_campaign_settings(series_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    """Merge top-level keys, so a PATCH of one setting cannot silently clear the
    rest. Returns the settings as they now stand."""
    merged = {**get_campaign_settings(series_id), **patch}
    with _lock:
        get_conn().execute(
            "INSERT INTO campaign_settings (series_id, data, updated_at) VALUES (?,?,?) "
            "ON CONFLICT(series_id) DO UPDATE SET data = excluded.data, "
            "updated_at = excluded.updated_at",
            (series_id, json.dumps(merged), _now()),
        )
        get_conn().commit()
    return merged


# -------------------------------------------------------------------- plan --


def save_plan(series_id: str, plan: dict, feedback: dict, options: dict) -> None:
    with _lock:
        get_conn().execute(
            """INSERT INTO series_plan (series_id, version, plan, feedback, options, updated_at)
               VALUES (?, 1, ?, ?, ?, ?)
               ON CONFLICT(series_id) DO UPDATE SET
                 version = series_plan.version + 1, plan = excluded.plan, feedback = excluded.feedback,
                 options = excluded.options, updated_at = excluded.updated_at""",
            (series_id, json.dumps(plan), json.dumps(feedback), json.dumps(options), _now()),
        )
        get_conn().commit()


def get_plan(series_id: str) -> Optional[dict[str, Any]]:
    with _lock:
        row = get_conn().execute("SELECT * FROM series_plan WHERE series_id = ?", (series_id,)).fetchone()
    if not row or not row["plan"]:
        return None
    return {
        "version": row["version"],
        "plan": json.loads(row["plan"]),
        "feedback": json.loads(row["feedback"]) if row["feedback"] else None,
        "options": json.loads(row["options"]) if row["options"] else None,
        "updated_at": row["updated_at"],
    }


def upsert_concept_state(
    series_id: str, concept_id: str, status: str, ccs: int, order_idx: int,
    coverage: Optional[int] = None,
) -> None:
    with _lock:
        get_conn().execute(
            """INSERT INTO concept_state (series_id, concept_id, status, ccs, order_idx, coverage)
               VALUES (?,?,?,?,?,?)
               ON CONFLICT(series_id, concept_id) DO UPDATE SET
                 status = excluded.status, ccs = excluded.ccs, coverage = excluded.coverage""",
            (series_id, concept_id, status, ccs, order_idx, coverage),
        )
        get_conn().commit()


def get_concept_states(series_id: str) -> list[dict[str, Any]]:
    with _lock:
        rows = get_conn().execute(
            "SELECT * FROM concept_state WHERE series_id = ? ORDER BY order_idx", (series_id,)
        ).fetchall()
    return [dict(r) for r in rows]


def set_concept_approved(series_id: str, concept_id: str, approved: bool) -> None:
    with _lock:
        get_conn().execute(
            "UPDATE concept_state SET approved = ?, status = CASE WHEN ? THEN 'approved' ELSE status END WHERE series_id = ? AND concept_id = ?",
            (1 if approved else 0, 1 if approved else 0, series_id, concept_id),
        )
        get_conn().commit()


def set_concept_status(series_id: str, concept_id: str, status: str, ccs: Optional[int] = None) -> None:
    with _lock:
        if ccs is None:
            get_conn().execute(
                "UPDATE concept_state SET status = ? WHERE series_id = ? AND concept_id = ?",
                (status, series_id, concept_id),
            )
        else:
            get_conn().execute(
                "UPDATE concept_state SET status = ?, ccs = ? WHERE series_id = ? AND concept_id = ?",
                (status, ccs, series_id, concept_id),
            )
        get_conn().commit()


def bump_regen(series_id: str, concept_id: str) -> None:
    with _lock:
        get_conn().execute(
            "UPDATE concept_state SET regen_count = regen_count + 1 WHERE series_id = ? AND concept_id = ?",
            (series_id, concept_id),
        )
        get_conn().commit()


def reorder_concepts(series_id: str, ordered_ids: list[str]) -> None:
    with _lock:
        for idx, concept_id in enumerate(ordered_ids):
            get_conn().execute(
                "UPDATE concept_state SET order_idx = ? WHERE series_id = ? AND concept_id = ?",
                (idx, series_id, concept_id),
            )
        get_conn().commit()


# ----------------------------------------------------------------- threads --


def create_thread(series_id: str, kind: str = "planning") -> dict[str, Any]:
    """Ordinal = max ever used + 1 for this series (never reused: deleted
    threads leave a gap by design — numbers are identity, not position)."""
    thread_id = new_id("thr")
    with _lock:
        row = get_conn().execute(
            "SELECT COALESCE(MAX(ordinal), 0) AS m FROM threads WHERE series_id = ?", (series_id,)
        ).fetchone()
        ordinal = int(row["m"]) + 1
        get_conn().execute(
            "INSERT INTO threads (id, series_id, ordinal, kind, created_at) VALUES (?,?,?,?,?)",
            (thread_id, series_id, ordinal, kind, _now()),
        )
        get_conn().commit()
    return {"id": thread_id, "series_id": series_id, "ordinal": ordinal, "kind": kind, "stage": "inspiration"}


def get_thread(thread_id: str) -> Optional[dict[str, Any]]:
    with _lock:
        row = get_conn().execute("SELECT * FROM threads WHERE id = ?", (thread_id,)).fetchone()
    return dict(row) if row else None


def get_series_threads(series_id: str) -> list[dict[str, Any]]:
    with _lock:
        rows = get_conn().execute(
            "SELECT * FROM threads WHERE series_id = ? ORDER BY ordinal", (series_id,)
        ).fetchall()
    return [dict(r) for r in rows]


def list_threads(kind: Optional[str] = None) -> list[dict[str, Any]]:
    """All threads, newest series first — `kind='campaign'` is how the
    Campaigns list separates campaign series from content series."""
    with _lock:
        if kind:
            rows = get_conn().execute(
                "SELECT * FROM threads WHERE kind = ? ORDER BY created_at DESC, ordinal DESC", (kind,)
            ).fetchall()
        else:
            rows = get_conn().execute("SELECT * FROM threads ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]


def set_thread_stage(thread_id: str, stage: str) -> None:
    with _lock:
        get_conn().execute("UPDATE threads SET stage = ? WHERE id = ?", (stage, thread_id))
        get_conn().commit()


def set_thread_formats(thread_id: str, format_ids: list[str]) -> None:
    with _lock:
        get_conn().execute(
            "UPDATE threads SET chosen_formats = ? WHERE id = ?",
            (json.dumps(format_ids), thread_id),
        )
        get_conn().commit()


def append_message(thread_id: str, role: str, envelope: dict[str, Any]) -> dict[str, Any]:
    msg_id = new_id("msg")
    with _lock:
        row = get_conn().execute(
            "SELECT COALESCE(MAX(seq), 0) AS m FROM thread_messages WHERE thread_id = ?", (thread_id,)
        ).fetchone()
        seq = int(row["m"]) + 1
        get_conn().execute(
            "INSERT INTO thread_messages (id, thread_id, seq, role, envelope, created_at) VALUES (?,?,?,?,?,?)",
            (msg_id, thread_id, seq, role, json.dumps(envelope, default=str), _now()),
        )
        get_conn().commit()
    return {"id": msg_id, "seq": seq, "role": role, "envelope": envelope}


def get_messages(thread_id: str, after_seq: int = 0) -> list[dict[str, Any]]:
    with _lock:
        rows = get_conn().execute(
            "SELECT * FROM thread_messages WHERE thread_id = ? AND seq > ? ORDER BY seq",
            (thread_id, after_seq),
        ).fetchall()
    return [
        {"id": r["id"], "seq": r["seq"], "role": r["role"],
         "envelope": json.loads(r["envelope"]), "created_at": r["created_at"]}
        for r in rows
    ]


def log_artifact_activity(thread_id: str, artifact_id: str, event: str, detail: Optional[str] = None) -> None:
    with _lock:
        get_conn().execute(
            "INSERT INTO artifact_activity (id, thread_id, artifact_id, event, detail, created_at) VALUES (?,?,?,?,?,?)",
            (new_id("act"), thread_id, artifact_id, event, detail, _now()),
        )
        get_conn().commit()


def get_artifact_activity(thread_id: str, artifact_id: str) -> list[dict[str, Any]]:
    with _lock:
        rows = get_conn().execute(
            "SELECT event, detail, created_at FROM artifact_activity WHERE thread_id = ? AND artifact_id = ? ORDER BY created_at",
            (thread_id, artifact_id),
        ).fetchall()
    return [dict(r) for r in rows]


# ---------------------------------------------- Addendum-02: post cards etc --


def save_post_card(card: dict[str, Any]) -> None:
    with _lock:
        get_conn().execute(
            """INSERT INTO post_cards (id, series_id, thread_id, concept_id, status, data, posted_at, created_at)
               VALUES (?,?,?,?,?,?,?,?)
               ON CONFLICT(id) DO UPDATE SET status = excluded.status,
                 data = excluded.data, posted_at = excluded.posted_at""",
            (card["id"], card["series_id"], card["thread_id"], card["concept_id"],
             card["status"], json.dumps(card, default=str), card.get("posted_at"), card.get("created_at") or _now()),
        )
        get_conn().commit()


def get_post_card(card_id: str) -> Optional[dict[str, Any]]:
    with _lock:
        row = get_conn().execute("SELECT data FROM post_cards WHERE id = ?", (card_id,)).fetchone()
    return json.loads(row["data"]) if row else None


def list_post_cards(series_id: Optional[str] = None) -> list[dict[str, Any]]:
    with _lock:
        if series_id:
            rows = get_conn().execute(
                "SELECT data FROM post_cards WHERE series_id = ? ORDER BY created_at DESC", (series_id,)
            ).fetchall()
        else:
            rows = get_conn().execute("SELECT data FROM post_cards ORDER BY created_at DESC").fetchall()
    return [json.loads(r["data"]) for r in rows]


def set_production_status(series_id: str, concept_id: str, status: str) -> None:
    with _lock:
        get_conn().execute(
            "UPDATE concept_state SET production_status = ? WHERE series_id = ? AND concept_id = ?",
            (status, series_id, concept_id),
        )
        get_conn().commit()


def add_asset(thread_id: Optional[str], slot: str, kind: str, path: str,
              params: dict[str, Any], cost: float, status: str = "ready") -> str:
    if not fixture_mode() and thread_id and not get_thread(thread_id):
        raise ValueError("Thread not found")
    asset_id = new_id("ast")
    ref = _persist_file(asset_id, path, "assets", mimetypes.guess_type(path)[0] or "application/octet-stream")
    with _lock:
        get_conn().execute(
            "INSERT INTO assets (id, thread_id, slot, kind, path, params, status, cost, created_at,storage_ref) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (asset_id, thread_id, slot, kind, path, json.dumps(params, default=str), status, cost, _now(), json.dumps(ref) if ref else None),
        )
        get_conn().commit()
    return asset_id


def get_asset(asset_id: str) -> Optional[dict[str, Any]]:
    with _lock:
        row = get_conn().execute("SELECT * FROM assets WHERE id = ?", (asset_id,)).fetchone()
    if not row:
        return None
    return {**dict(row), "params": json.loads(row["params"])}


def set_asset_status(asset_id: str, status: str) -> None:
    with _lock:
        get_conn().execute("UPDATE assets SET status = ? WHERE id = ?", (status, asset_id))
        get_conn().commit()


def set_asset_name(asset_id: str, name: str) -> bool:
    """A user-given name for one asset, kept in params.

    Renaming is SAFE — it spends nothing and destroys nothing — which is why
    the read-only detail panel is allowed to offer it while a re-render stays
    in the chat with its price attached.
    """
    asset = get_asset(asset_id)
    if not asset:
        return False
    params = {**asset["params"], "name": name.strip()}
    with _lock:
        get_conn().execute("UPDATE assets SET params = ? WHERE id = ?",
                           (json.dumps(params), asset_id))
        get_conn().commit()
    return True


def delete_asset(asset_id: str) -> bool:
    """Forget the asset row. The FILE is deliberately left on disk: it was paid
    for, the generation_log still points at it, and a delete in the UI means
    'take it out of my way', not 'destroy the evidence of what I was charged'.
    """
    with _lock:
        cur = get_conn().execute("DELETE FROM assets WHERE id = ?", (asset_id,))
        get_conn().commit()
    return cur.rowcount > 0


def list_assets(thread_id: Optional[str] = None) -> list[dict[str, Any]]:
    with _lock:
        if thread_id:
            rows = get_conn().execute("SELECT * FROM assets WHERE thread_id = ? ORDER BY created_at", (thread_id,)).fetchall()
        else:
            rows = get_conn().execute("SELECT * FROM assets ORDER BY created_at DESC LIMIT 200").fetchall()
    return [{**dict(r), "params": json.loads(r["params"])} for r in rows]


def log_generation(thread_id: Optional[str], asset_id: Optional[str], event: str,
                   prompt: Optional[str] = None, model: Optional[str] = None,
                   seed: Optional[str] = None, cost: float = 0) -> None:
    if not fixture_mode():
        if thread_id and not get_thread(thread_id):
            raise ValueError("Thread not found")
        if asset_id and not get_asset(asset_id):
            raise ValueError("Asset not found")
    with _lock:
        get_conn().execute(
            "INSERT INTO generation_log (id, thread_id, asset_id, event, prompt, model, seed, cost, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
            (new_id("gen"), thread_id, asset_id, event, prompt, model, seed, cost, _now()),
        )
        get_conn().commit()


def recent_generations(limit: int = 200) -> list[dict[str, Any]]:
    """Every media generation across ALL threads, newest first.

    The per-thread log answers "what did this campaign cost". This answers
    "which provider actually served the last N renders, and what did each one
    charge" — which is the question you ask when a fallback fires, or when a
    model name silently 404s after a cost gate. The model column carries its
    provider prefix, so the answer is in the row rather than inferred.
    """
    with _lock:
        rows = get_conn().execute(
            "SELECT g.*, t.series_id FROM generation_log g "
            "LEFT JOIN threads t ON t.id = g.thread_id "
            "ORDER BY g.created_at DESC LIMIT ?", (limit,)
        ).fetchall()
    return [dict(r) for r in rows]


def get_generation_log(thread_id: str) -> list[dict[str, Any]]:
    with _lock:
        rows = get_conn().execute(
            "SELECT * FROM generation_log WHERE thread_id = ? ORDER BY created_at", (thread_id,)
        ).fetchall()
    return [dict(r) for r in rows]


# ------------------------------------ Addendum-03: campaigns + ad cards -----

# My Campaigns lifecycle (v2 §My Campaigns). Stored in series.status — a
# campaign IS a series row, so there is one status column, not two.
CAMPAIGN_STATUSES = ("draft", "planned", "in_production", "ready", "live")


def save_ad_card(card: dict[str, Any]) -> None:
    with _lock:
        get_conn().execute(
            """INSERT INTO ad_cards (id, campaign_id, thread_id, option_id, variant_group_id,
                                     variant_id, status, data, created_at)
               VALUES (?,?,?,?,?,?,?,?,?)
               ON CONFLICT(id) DO UPDATE SET status = excluded.status,
                 variant_group_id = excluded.variant_group_id,
                 variant_id = excluded.variant_id, data = excluded.data""",
            (card["id"], card["campaign_id"], card["thread_id"], card["option_id"],
             card.get("variant_group_id"), card.get("variant_id"), card.get("status", "draft"),
             json.dumps(card, default=str), card.get("created_at") or _now()),
        )
        get_conn().commit()


def get_ad_card(card_id: str) -> Optional[dict[str, Any]]:
    with _lock:
        row = get_conn().execute("SELECT data FROM ad_cards WHERE id = ?", (card_id,)).fetchone()
    return json.loads(row["data"]) if row else None


def list_ad_cards(campaign_id: Optional[str] = None) -> list[dict[str, Any]]:
    with _lock:
        if campaign_id:
            rows = get_conn().execute(
                "SELECT data FROM ad_cards WHERE campaign_id = ? ORDER BY created_at DESC", (campaign_id,)
            ).fetchall()
        else:
            rows = get_conn().execute("SELECT data FROM ad_cards ORDER BY created_at DESC").fetchall()
    return [json.loads(r["data"]) for r in rows]


def set_campaign_status(campaign_id: str, status: str) -> None:
    if status not in CAMPAIGN_STATUSES:
        raise ValueError(f"unknown campaign status {status!r} — expected one of {list(CAMPAIGN_STATUSES)}")
    set_series_status(campaign_id, status)


def get_campaign_status(campaign_id: str) -> str:
    """Empty string when the campaign doesn't exist — callers 404 on that
    rather than being handed a plausible-looking 'draft'."""
    with _lock:
        row = get_conn().execute("SELECT status FROM series WHERE id = ?", (campaign_id,)).fetchone()
    return row["status"] if row else ""


def campaign_spend(campaign_id: str) -> float:
    """Spend-to-date in USD: every asset generated in any thread of this
    campaign, mock ($0) or fal. 0.0 when nothing has been generated."""
    with _lock:
        row = get_conn().execute(
            """SELECT COALESCE(SUM(a.cost), 0) AS total FROM assets a
               JOIN threads t ON t.id = a.thread_id WHERE t.series_id = ?""",
            (campaign_id,),
        ).fetchone()
    return float(row["total"] or 0.0)


# -------------------------------------------------------------------- runs --


def create_run(series_id: str, kind: str) -> str:
    run_id = new_id("run")
    with _lock:
        get_conn().execute(
            "INSERT INTO pipeline_runs (id, series_id, kind, status, created_at) VALUES (?,?,?,?,?)",
            (run_id, series_id, kind, "running", _now()),
        )
        get_conn().commit()
    return run_id


def finish_run(run_id: str, status: str, error: Optional[str] = None) -> None:
    with _lock:
        get_conn().execute(
            "UPDATE pipeline_runs SET status = ?, error = ?, finished_at = ? WHERE id = ?",
            (status, error, _now(), run_id),
        )
        get_conn().commit()


def last_job_status(thread_id: str) -> Optional[dict[str, Any]]:
    with _lock:
        row = get_conn().execute("SELECT status,created_at,finished_at FROM pipeline_runs WHERE kind=? ORDER BY created_at DESC LIMIT 1", ("job:" + thread_id,)).fetchone()
    return dict(row) if row else None


# ------------------------------------------------------------- performance --


def add_performance(series_id: Optional[str], concept_id: Optional[str], platform: str, metrics: dict) -> str:
    row_id = new_id("perf")
    with _lock:
        get_conn().execute(
            "INSERT INTO performance_log (id, series_id, concept_id, platform, metrics, pasted_at) VALUES (?,?,?,?,?,?)",
            (row_id, series_id, concept_id, platform, json.dumps(metrics), _now()),
        )
        get_conn().commit()
    return row_id


def list_performance() -> list[dict[str, Any]]:
    with _lock:
        rows = get_conn().execute("SELECT * FROM performance_log ORDER BY pasted_at DESC").fetchall()
    return [
        {**dict(r), "metrics": json.loads(r["metrics"])}
        for r in rows
    ]


# ----------------------------------------------------------------- uploads --


def add_upload(filename: str, kind: str, path: str, content_type: Optional[str], series_id: Optional[str]) -> str:
    if not fixture_mode() and series_id and not get_series(series_id):
        raise ValueError("Campaign not found")
    upload_id = new_id("upl")
    ref = _persist_file(upload_id, path, "uploads", content_type or "application/octet-stream")
    with _lock:
        get_conn().execute(
            "INSERT INTO uploads (id, filename, kind, path, content_type, series_id, created_at,storage_ref) VALUES (?,?,?,?,?,?,?,?)",
            (upload_id, filename, kind, path, content_type, series_id, _now(), json.dumps(ref) if ref else None),
        )
        get_conn().commit()
    return upload_id


def get_uploads(upload_ids: list[str]) -> list[dict[str, Any]]:
    if not upload_ids:
        return []
    marks = ",".join("?" for _ in upload_ids)
    with _lock:
        rows = get_conn().execute(f"SELECT * FROM uploads WHERE id IN ({marks})", upload_ids).fetchall()
    return [dict(r) for r in rows]


def list_uploads() -> list[dict[str, Any]]:
    with _lock:
        rows = get_conn().execute("SELECT * FROM uploads ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]


def _persist_file(identifier: str, path: str, directory: str, content_type: str):
    if fixture_mode():
        return None
    from app.media_storage import persist_asset
    actor = require_execution()
    source = owned_file(path, directory)
    size = source.stat().st_size
    if not 0 < size <= 64 * 1024 * 1024:
        raise ValueError("File exceeds storage limit")
    ticket = str(uuid.uuid4())
    # Reserve before the first S3 write. Pending/failed tickets remain counted:
    # an ambiguous PUT may have produced a durable version even without a reply.
    with connection(owner_id=actor.owner_id) as conn:
        shared = conn.execute("SELECT bytes FROM shared_storage WHERE id=1 FOR UPDATE").fetchone()
        own = conn.execute("SELECT coalesce(sum(bytes),0) AS bytes,count(*) AS n FROM storage_reservations WHERE owner_id=%s", (actor.owner_id,)).fetchone()
        if own["bytes"] + size > 512 * 1024 * 1024 or own["n"] >= 1000 or shared["bytes"] + size > 2 * 1024 * 1024 * 1024:
            raise ValueError("Private storage capacity reached")
        conn.execute("INSERT INTO storage_reservations(id,owner_id,bytes,status) VALUES(%s,%s,%s,'pending')", (ticket, actor.owner_id, size))
        conn.execute("UPDATE shared_storage SET bytes=bytes+%s WHERE id=1", (size,))
    try:
        ref = persist_asset(actor.owner_id, identifier, source, content_type, kind=directory)
        with connection(owner_id=actor.owner_id) as conn:
            conn.execute("UPDATE storage_reservations SET status='complete',storage_ref=%s WHERE id=%s AND owner_id=%s", (json.dumps(ref), ticket, actor.owner_id))
        return ref
    except BaseException:
        with connection(owner_id=actor.owner_id) as conn:
            conn.execute("UPDATE storage_reservations SET status='failed' WHERE id=%s AND owner_id=%s", (ticket, actor.owner_id))
        raise


def file_path(row: dict, directory: str) -> Path:
    """Owner-scoped row only; hydrate exactly the recorded S3 version/hash."""
    if fixture_mode():
        return Path(row["path"])
    from app.media_storage import hydrate_asset
    actor = require_execution()
    if str(row.get("owner_id")) != actor.owner_id:
        raise PermissionError("Foreign file")
    target = Path(row["path"])
    root = owner_directory(directory)
    if target.is_symlink() or root not in target.resolve().parents:
        raise PermissionError("Invalid private file path")
    ref = json.loads(row["storage_ref"]) if row.get("storage_ref") else None
    if ref:
        if target.is_file() and target.stat().st_size == ref["bytes"] and hashlib.sha256(target.read_bytes()).hexdigest() == ref["sha256"]:
            return owned_file(target, directory)
        return hydrate_asset(actor.owner_id, ref, target)
    # No silent hosted downgrade to unverified local bytes.
    if getattr(config, "HOSTED", False) and not local_preview():
        raise FileNotFoundError("Durable file reference unavailable")
    return owned_file(target, directory)


def campaign_media_credits(series_id: str):
    """Provider-reported credits only; mixed or missing units stay unknown."""
    if not get_series(series_id):
        raise ValueError("Campaign not found")
    if fixture_mode():
        return 0.0 if config.MOCK_MEDIA else None
    actor=require_execution()
    with connection(owner_id=actor.owner_id) as conn:
        row=conn.execute("""SELECT count(*) AS operations,count(consumed_credits) AS known,
            count(DISTINCT provider) AS providers,sum(consumed_credits) AS credits FROM usage
            WHERE owner_id=%s AND campaign_id=%s AND kind='media' AND status!='released'""",(actor.owner_id,series_id)).fetchone()
    if not row["operations"]:return 0.0
    return float(row["credits"]) if row["known"]==row["operations"] and row["providers"]==1 else None
