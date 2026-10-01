"""Short verified PostgreSQL transactions; no runtime schema privileges."""
from __future__ import annotations
import os
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
import psycopg
from psycopg.rows import dict_row

def parameters() -> dict:
    address = os.environ.get("DATABASE_URL", "")
    if not address:
        raise RuntimeError("PostgreSQL configuration is required")
    parsed = urlsplit(address)
    if parsed.scheme not in ("postgres", "postgresql"):
        raise RuntimeError("Invalid database scheme")
    query = {k: v for k, v in parse_qsl(parsed.query) if not k.lower().startswith("ssl")}
    address = urlunsplit(parsed._replace(query=urlencode(query)))
    params = {"conninfo": address, "connect_timeout": 10, "row_factory": dict_row,
              "options": "-c statement_timeout=15000 -c lock_timeout=10000 -c idle_in_transaction_session_timeout=15000"}
    if os.environ.get("DATABASE_SSL") == "disable":
        if parsed.hostname not in ("127.0.0.1", "localhost", "::1") or os.environ.get("NODE_ENV") == "production":
            raise RuntimeError("Plaintext database is restricted to local tests")
        params["sslmode"] = "disable"
    else:
        ca = os.environ.get("DATABASE_SSL_CA_FILE", "")
        if not ca or not Path(ca).is_file():
            raise RuntimeError("A verified PostgreSQL CA is required")
        params.update(sslmode="verify-full", sslrootcert=ca)
    return params

@contextmanager
def connection(*, owner_id: str | None = None):
    with psycopg.connect(**parameters()) as conn:
        if owner_id is not None:
            # SET LOCAL is transaction-bound, never a pooled session identity.
            conn.execute("SELECT set_config('app.owner_id',%s,true)", (owner_id,))
        yield conn

def ready() -> dict:
    with connection() as conn:
        row = conn.execute("""SELECT current_database() AS database,current_user AS role,
            rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user""").fetchone()
        if row["rolsuper"] or row["rolbypassrls"]:
            raise RuntimeError("Unsafe runtime database role")
        expected = os.environ.get("DATABASE_NAME")
        if expected and row["database"] != expected:
            raise RuntimeError("Unexpected database")
        if not conn.execute("SELECT 1 FROM schema_version WHERE version=1").fetchone():
            raise RuntimeError("Database migration is required")
        protected = (*STATE_TABLES, "usage", "storage_reservations")
        policies = conn.execute("""SELECT count(*) AS n FROM pg_class
          WHERE relnamespace='public'::regnamespace AND relname=ANY(%s)
            AND relrowsecurity AND relforcerowsecurity""", (list(protected),)).fetchone()
        if policies["n"] != len(protected):
            raise RuntimeError("Owner policies are incomplete")
        if any(conn.execute("SELECT has_table_privilege(current_user,%s,'TRUNCATE') AS yes", (t,)).fetchone()["yes"] for t in protected):
            raise RuntimeError("Runtime cannot own or truncate state tables")
        return {"ok": True, "tables": len(STATE_TABLES), "protected_tables": len(protected)}

STATE_TABLES = ("profile", "series", "campaign_settings", "run_checkpoints", "canon_sheets",
    "series_plan", "concept_state", "pipeline_runs", "performance_log", "uploads", "threads",
    "thread_messages", "artifact_activity", "post_cards", "ad_cards", "assets", "generation_log")
