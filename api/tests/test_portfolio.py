"""Real non-owner PostgreSQL role contracts; provider-free and isolated."""
from __future__ import annotations
import json
import os
import threading
import uuid
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
import pytest
from app import database, store, usage
from app.execution import Execution, execution_scope, require_execution

@pytest.fixture
def pg_env(monkeypatch):
    path = os.getenv("PLOTLINE_TEST_ENV")
    if not path:
        pytest.skip("Explicit isolated PostgreSQL test environment not supplied")
    data = json.loads(Path(path).read_text())
    assert data["DATABASE_NAME"] == "plotline_auth_test"
    for name, value in data.items():
        if not name.startswith("_"):
            monkeypatch.setenv(name, str(value))
    monkeypatch.delenv("PLOTLINE_FIXTURE_MODE", raising=False)
    monkeypatch.setenv("NODE_ENV", "test")
    assert database.ready()["protected_tables"] == 19
    created = []
    def actor():
        owner, session = str(uuid.uuid4()), str(uuid.uuid4())
        with database.connection() as conn:
            conn.execute("INSERT INTO users(id,email,password_hash) VALUES(%s,%s,%s)", (owner, owner + "@fixture.invalid", "not-a-login-credential"))
            conn.execute("INSERT INTO sessions(id,owner_id,expires_at) VALUES(%s,%s,now()+interval '1 hour')", (session, owner))
        created.append(owner)
        return Execution(owner, session)
    yield actor
    # Isolated test DB only: undo precisely this test's synthetic usage counters.
    # Existing owners/evidence are not reset and no real provider was called.
    for owner in created:
        with database.connection(owner_id=owner) as conn:
            conn.execute("SELECT id FROM shared_budget WHERE id=1 FOR UPDATE")
            counted = conn.execute("""SELECT coalesce(sum(coalesce(actual_usd,reserved_usd)),0) AS usd,
                count(*) FILTER(WHERE status IN ('reserved','dispatched')) AS active,
                count(*) FILTER(WHERE kind='media') AS media FROM usage
                WHERE owner_id=%s AND status!='released'""", (owner,)).fetchone()
            conn.execute("UPDATE shared_budget SET committed_usd=committed_usd-%s,active=active-%s,media_calls=media_calls-%s WHERE id=1", (counted["usd"],counted["active"],counted["media"]))
            conn.execute("DELETE FROM usage WHERE owner_id=%s", (owner,))

def test_pg_forced_owner_rows_foreign_upserts_and_missing_actor(pg_env):
    a, b = pg_env(), pg_env()
    with execution_scope(a):
        store.save_profile({"niche": "owner-A"})
        cid = store.create_series({"name": "Private A"})
        tid = store.create_thread(cid)["id"]
        store.append_message(tid, "user", {"text": "private synthetic A"})
        store.save_checkpoint(tid, "_board_output", {"input_sha256": "a" * 64, "board": {"fixture": "A"}})
    with execution_scope(b):
        assert store.get_profile() == {}
        assert store.get_series(cid) is None and store.get_thread(tid) is None
        assert store.get_messages(tid) == []
        assert store.load_checkpoint(tid, "_board_output") is None
        with pytest.raises(Exception):
            store.save_checkpoint(tid, "_board_output", {"foreign": True})
        store.save_profile({"niche": "owner-B"})
    with execution_scope(a):
        assert store.get_profile()["niche"] == "owner-A"
        assert len(store.get_messages(tid)) == 1
        assert store.load_checkpoint(tid, "_board_output")["board"] == {"fixture": "A"}
    with pytest.raises(PermissionError):
        store.list_series()
    with database.connection() as conn:
        assert conn.execute("SELECT count(*) AS n FROM series").fetchone()["n"] == 0
        with pytest.raises(Exception):
            conn.execute("TRUNCATE series")

def test_concurrent_scopes_never_reuse_connection_identity(pg_env):
    actors = [pg_env(), pg_env()]
    barrier = threading.Barrier(2)
    def work(actor):
        with execution_scope(actor):
            barrier.wait(timeout=5)
            for index in range(4):
                store.create_series({"name": actor.owner_id + str(index)})
            return {row["name"][:-1] for row in store.list_series()}
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(work, actors))
    assert results == [{a.owner_id} for a in actors]

def test_usage_revocation_before_dispatch_releases_capacity(pg_env):
    actor = pg_env()
    with execution_scope(actor):
        with database.connection() as conn:
            before = conn.execute("SELECT committed_usd,active FROM shared_budget WHERE id=1").fetchone()
        reservation = usage.reserve(kind="llm", provider="fixture", model="fixture", maximum_usd="0.01")
        with database.connection() as conn:
            conn.execute("UPDATE sessions SET revoked_at=now() WHERE id=%s AND owner_id=%s", (actor.session_id, actor.owner_id))
        with pytest.raises(PermissionError):
            usage.dispatch(reservation, request_sha256="0" * 64)
        with database.connection(owner_id=actor.owner_id) as conn:
            row = conn.execute("SELECT status,request_sha256 FROM usage WHERE id=%s AND owner_id=%s", (reservation.id, actor.owner_id)).fetchone()
            after = conn.execute("SELECT committed_usd,active FROM shared_budget WHERE id=1").fetchone()
        assert row == {"status": "released", "request_sha256": None}
        assert before == after

def test_usage_preserves_settlement_and_foreign_owner_cannot_change_it(pg_env):
    a, b = pg_env(), pg_env()
    with execution_scope(a):
        r = usage.reserve(kind="llm", provider="fixture", model="fixture", maximum_usd="0.02")
        usage.dispatch(r, request_sha256="1" * 64)
        usage.settle(r, actual_usd="0.001", input_tokens=20, output_tokens=5)
        usage.uncertain(r, reason="response_invalid")
        with pytest.raises(ValueError):
            usage.dispatch(r, request_sha256="1" * 64)
    with execution_scope(b):
        with pytest.raises(PermissionError):
            usage.settle(r, actual_usd=0)
    with execution_scope(a), database.connection(owner_id=a.owner_id) as conn:
        row = conn.execute("SELECT status,actual_usd,input_tokens FROM usage WHERE id=%s AND owner_id=%s", (r.id, a.owner_id)).fetchone()
        assert row == {"status": "complete", "actual_usd": Decimal("0.001"), "input_tokens": 20}

def test_media_operation_limit_is_separate_from_unknown_usd(pg_env, monkeypatch):
    monkeypatch.delenv("PLOTLINE_OWNER_MEDIA_LIMIT", raising=False)
    actor = pg_env()
    with execution_scope(actor):
        for index in range(6):
            r = usage.reserve(kind="media", provider="fixture", model="fixture", maximum_usd=0)
            usage.dispatch(r, request_sha256=f"{index:064x}")
            usage.settle(r, actual_usd=None, consumed_credits="3")
        with pytest.raises(ValueError, match="media generation allowance"):
            usage.reserve(kind="media", provider="fixture", model="fixture", maximum_usd=0)
        with database.connection(owner_id=actor.owner_id) as conn:
            rows = conn.execute("SELECT actual_usd,consumed_credits FROM usage WHERE owner_id=%s", (actor.owner_id,)).fetchall()
        assert len(rows) == 6 and all(row["actual_usd"] is None and row["consumed_credits"] == 3 for row in rows)
        monkeypatch.setenv("PLOTLINE_OWNER_MEDIA_LIMIT", "8")
        for index in range(6, 8):
            r = usage.reserve(kind="media", provider="fixture", model="fixture", maximum_usd=0)
            usage.dispatch(r, request_sha256=f"{index:064x}")
            usage.settle(r, actual_usd=None, consumed_credits=None)
        with pytest.raises(ValueError, match="media generation allowance"):
            usage.reserve(kind="media", provider="fixture", model="fixture", maximum_usd=0)
        monkeypatch.delenv("PLOTLINE_OWNER_MEDIA_LIMIT")
        with pytest.raises(ValueError, match="media generation allowance"):
            usage.reserve(kind="media", provider="fixture", model="fixture", maximum_usd=0)
        with database.connection(owner_id=actor.owner_id) as conn:
            preserved = conn.execute("SELECT actual_usd,consumed_credits FROM usage WHERE owner_id=%s ORDER BY created_at", (actor.owner_id,)).fetchall()
        assert len(preserved) == 8 and preserved[:6] == rows


def test_invalid_media_limit_rejects_before_reservation(pg_env, monkeypatch):
    actor = pg_env()
    with execution_scope(actor):
        with database.connection(owner_id=actor.owner_id) as conn:
            before = conn.execute("SELECT * FROM shared_budget WHERE id=1").fetchone()
        for value in ("", "0", "-1", "21", "100000", "8.0", " 8", "08", "NaN"):
            monkeypatch.setenv("PLOTLINE_OWNER_MEDIA_LIMIT", value)
            with pytest.raises(ValueError, match="Invalid media generation allowance"):
                usage.reserve(kind="media", provider="fixture", model="fixture", maximum_usd=0)
        with database.connection(owner_id=actor.owner_id) as conn:
            assert conn.execute("SELECT * FROM shared_budget WHERE id=1").fetchone() == before
            assert conn.execute("SELECT count(*) AS n FROM usage WHERE owner_id=%s", (actor.owner_id,)).fetchone()["n"] == 0


def test_pixelbin_rejection_survives_in_owner_activity_without_sensitive_body(pg_env, monkeypatch):
    from dataclasses import replace
    import httpx
    from app import config, media_transport, pixelbin_client
    a, b = pg_env(), pg_env()
    with execution_scope(a):
        campaign = store.create_series({"name": "Rejection fixture"})
        thread = store.create_thread(campaign)["id"]
    monkeypatch.setattr(config, "PIXELBIN_API_TOKEN", "fixture-only")
    calls = []
    def request(method, url, **kwargs):
        calls.append(method)
        return httpx.Response(400, json={"errorCode": "JR-0400", "message": "private signed URL or prompt",
            "details": [{"instancePath": "/input/images"}]}, request=httpx.Request(method, url))
    monkeypatch.setattr(media_transport, "request", request)
    with execution_scope(replace(a, campaign_id=campaign, thread_id=thread)):
        with pytest.raises(pixelbin_client.PixelbinError):
            with media_transport.attempt("pixelbin", "nanoBanana_generate", 0):
                pixelbin_client.submit_and_wait("nanoBanana_generate", {"prompt": "private prompt", "images": ["https://owned.example/private"]})
        activity = store.get_artifact_activity(thread, "media")
        assert len(activity) == 1 and activity[0]["event"] == "provider_rejected"
        assert activity[0]["detail"] == "PixelBin rejected submission: status=400 code=JR-0400 param=/input/images"
        with database.connection(owner_id=a.owner_id) as conn:
            rows = conn.execute("SELECT status,actual_usd,provider_job_id FROM usage WHERE owner_id=%s", (a.owner_id,)).fetchall()
        assert rows == [{"status": "usage_unavailable", "actual_usd": None, "provider_job_id": None}]
    with execution_scope(b):
        assert store.get_artifact_activity(thread, "media") == []
    assert calls == ["POST"]


def test_canon_names_are_owner_scoped_and_assets_survive_campaign_delete(pg_env, monkeypatch, tmp_path):
    from app import config
    from app.execution import owner_directory
    monkeypatch.setattr(config, "DATA_DIR", tmp_path)
    a, b = pg_env(), pg_env()
    with execution_scope(a):
        cid = store.create_series({"name": "Canon source"})
        tid = store.create_thread(cid)["id"]
        file = owner_directory("assets") / "sample.svg"
        file.write_text('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>')
        aid = store.add_asset(tid, "canon", "image", str(file), {"model": "mock"}, 0)
        store.save_canon_sheet({"id": "@same-product", "kind": "product", "label": "A", "asset_ids": [aid], "sheet_asset_id": aid}, cid)
        store.log_generation(tid, aid, "generate", model="mock", cost=0)
    with execution_scope(b):
        assert store.get_canon_sheet("@same-product") is None
        with pytest.raises(ValueError, match="Asset not found"):
            store.save_canon_sheet({"id":"@foreign", "kind":"product", "asset_ids":[aid]})
        store.save_canon_sheet({"id": "@same-product", "kind": "product", "label": "B"})
        assert store.get_canon_sheet("@same-product")["label"] == "B"
        assert store.get_asset(aid) is None
    with execution_scope(a):
        store.delete_series(cid)
        assert store.get_series(cid) is None
        assert store.get_canon_sheet("@same-product")["sheet_asset_id"] == aid
        asset = store.get_asset(aid)
        assert asset["thread_id"] is None and store.file_path(asset,"assets").read_bytes() == file.read_bytes()
        assert store.recent_generations(5)[0]["thread_id"] is None
        next_campaign = store.create_series({"name": "Reuse canon"})
        store.save_canon_sheet(store.get_canon_sheet("@same-product"), next_campaign)
    with execution_scope(b):
        assert store.get_canon_sheet("@same-product")["label"] == "B" and store.get_asset(aid) is None


def test_private_files_reject_symlinks_and_foreign_owner(pg_env, monkeypatch, tmp_path):
    from app import config
    from app.execution import owner_directory, owned_file
    monkeypatch.setattr(config, "DATA_DIR", tmp_path / "private")
    a, b = pg_env(), pg_env()
    with execution_scope(a):
        own = owner_directory("assets") / "own.txt"
        own.write_text("synthetic private")
        link = own.with_name("link.txt"); link.symlink_to(own)
        with pytest.raises(PermissionError): owned_file(link, "assets")
    with execution_scope(b):
        with pytest.raises((PermissionError,FileNotFoundError)): owned_file(own, "assets")


def test_loopback_preview_never_accepts_public_or_live_configuration(pg_env, monkeypatch):
    from app.execution import local_preview
    assert local_preview()
    for name, value in [("PUBLIC_ORIGIN","https://example.com"),("DATABASE_URL","postgresql://a@db.example/db"),("MOCK_MEDIA","0"),("OPENAI_API_KEY","synthetic-test-only"),("NODE_ENV","production")]:
        with monkeypatch.context() as m:
            m.setenv(name,value)
            with pytest.raises(RuntimeError, match="local preview"): local_preview()


def test_pre_dispatch_caps_reject_without_mutating_usage(pg_env, monkeypatch):
    actor = pg_env()
    with execution_scope(actor):
        with database.connection() as conn:
            before = conn.execute("SELECT * FROM shared_budget WHERE id=1").fetchone()
        monkeypatch.setenv("PLOTLINE_OWNER_BUDGET_USD","0.001")
        with pytest.raises(ValueError, match="spend limit"):
            usage.reserve(kind="llm", provider="fixture", model="fixture", maximum_usd="0.01")
        with database.connection(owner_id=actor.owner_id) as conn:
            assert conn.execute("SELECT * FROM shared_budget WHERE id=1").fetchone() == before
            assert conn.execute("SELECT count(*) AS n FROM usage WHERE owner_id=%s", (actor.owner_id,)).fetchone()["n"] == 0


def test_signed_bridge_binds_body_path_nonce_and_revocable_session(pg_env):
    import base64, hashlib, hmac, time
    from app.auth import verify_binding, secret
    a, b = pg_env(), pg_env()
    def token(actor=a, **changed):
        now = int(time.time())
        data = {"v":1,"owner_id":actor.owner_id,"session_id":actor.session_id,"nonce":str(uuid.uuid4()),
                "iat":now,"exp":now+30,"method":"POST","path":"/api/campaigns","sha256":hashlib.sha256(b'{}').hexdigest(), **changed}
        encoded = base64.urlsafe_b64encode(json.dumps(data).encode()).decode().rstrip("=")
        sig = base64.urlsafe_b64encode(hmac.new(secret(),encoded.encode(),hashlib.sha256).digest()).decode().rstrip("=")
        return encoded + "." + sig
    signed = token()
    assert verify_binding(signed,"POST","/api/campaigns",b'{}').owner_id == a.owner_id
    for candidate, path, body in [(signed,"/api/campaigns",b'{}'),(token(),"/api/profile",b'{}'),(token(),"/api/campaigns",b'{"x":1}'),(token(owner_id=b.owner_id),"/api/campaigns",b'{}')]:
        with pytest.raises(PermissionError): verify_binding(candidate,"POST",path,body)
    signed = token()
    with database.connection() as conn:
        conn.execute("UPDATE sessions SET revoked_at=now() WHERE id=%s AND owner_id=%s",(a.session_id,a.owner_id))
    with pytest.raises(PermissionError): verify_binding(signed,"POST","/api/campaigns",b'{}')


def test_background_jobs_preserve_actors_and_release_setup_failure(pg_env, monkeypatch):
    from app import campaign
    a,b = pg_env(),pg_env()
    started=threading.Barrier(2); completed=[threading.Event(),threading.Event()]; observed=[]
    pairs=[]
    for actor in (a,b):
        with execution_scope(actor):
            cid=store.create_series({"name":"Job fixture"});tid=store.create_thread(cid)["id"];pairs.append((actor,tid))
    def work(index,tid):
        try:
            started.wait(timeout=10)
            observed.append(require_execution().owner_id)
            store.append_message(tid,"user",{"text":"synthetic scoped job"})
        finally: completed[index].set()
    for index,(actor,tid) in enumerate(pairs):
        with execution_scope(actor): campaign._spawn(tid,work,index,tid)
    assert all(event.wait(15) for event in completed)
    import time
    until=time.monotonic()+5
    while any(campaign._owner_jobs.get(actor.owner_id) for actor,_ in pairs) and time.monotonic()<until: time.sleep(.01)
    assert set(observed)=={a.owner_id,b.owner_id}
    for actor,tid in pairs:
        with execution_scope(actor): assert len(store.get_messages(tid))==1
    class BrokenThread:
        def __init__(self,**kwargs):pass
        def start(self):raise RuntimeError("synthetic start failure")
    with monkeypatch.context() as m, execution_scope(a):
        m.setattr(campaign.threading,"Thread",BrokenThread)
        m.setattr(store,"finish_run",lambda *a,**k: (_ for _ in ()).throw(RuntimeError("synthetic persistence failure")))
        with pytest.raises(RuntimeError): campaign._spawn(pairs[0][1],lambda:None)
    assert a.owner_id not in campaign._owner_jobs and b.owner_id not in campaign._owner_jobs


def test_quota_rejects_oversized_state_without_replacing_saved_data(pg_env):
    actor=pg_env()
    with execution_scope(actor):
        store.save_profile({"niche":"keep this"})
        with database.connection(owner_id=actor.owner_id) as conn:
            before=conn.execute("SELECT bytes,rows FROM state_quota WHERE owner_id=%s",(actor.owner_id,)).fetchone()
        with pytest.raises(Exception,match="Workspace capacity reached"):
            store.save_profile({"niche":"x"*(33*1024*1024)})
        assert store.get_profile()=={"niche":"keep this"}
        with database.connection(owner_id=actor.owner_id) as conn:
            assert conn.execute("SELECT bytes,rows FROM state_quota WHERE owner_id=%s",(actor.owner_id,)).fetchone()==before


def test_cached_failed_job_recovers_explicitly_after_workspace_restart(pg_env, monkeypatch):
    import time
    from app import campaign, config, examples
    from app.agents import runner
    from app.schemas import UserEvent
    from app.execution import for_thread
    actor=pg_env()
    with execution_scope(actor):
        prepared=examples.create("ceramic-mugs")
        tid=prepared["thread"]["id"]
        scoped=for_thread(tid)
    def wait_job():
        deadline=time.monotonic()+10
        while time.monotonic()<deadline:
            with execution_scope(scoped): row=store.last_job_status(tid)
            if row and row["status"]!="running" and not campaign._owner_jobs.get(actor.owner_id):return row
            time.sleep(.02)
        raise AssertionError("job did not finish")
    original=campaign._say
    def broken(*args,**kwargs):raise RuntimeError("synthetic serializer failure")
    monkeypatch.setattr(config,"MOCK_LLM",False)
    monkeypatch.setattr(runner,"_llm_call",lambda *a,**k: (_ for _ in ()).throw(AssertionError("cached recovery attempted provider")))
    with execution_scope(scoped), monkeypatch.context() as m:
        m.setattr(campaign,"_say",broken)
        campaign.handle_event(UserEvent(thread_id=tid,type="action",action={"artifact_id":"intake","event":"begin"}))
        assert wait_job()["status"]=="failed"
    campaign._WORKSPACES.pop(tid,None)
    with execution_scope(scoped):
        job=campaign.recovery_job(store.get_thread(tid))
        assert job and job[0].__name__=="_brief_turn"
        campaign.handle_event(UserEvent(thread_id=tid,type="action",action={"artifact_id":"recovery","event":"retry"}))
    assert wait_job()["status"]=="finished"
    with execution_scope(scoped):
        messages=store.get_messages(tid)
        assert any(a.get("type")=="campaign_brief" and a["payload"]["cached"] for m in messages for a in m.get("envelope",{}).get("artifacts",[]))
        with database.connection(owner_id=actor.owner_id) as conn:
            assert conn.execute("SELECT count(*) AS n FROM usage WHERE owner_id=%s",(actor.owner_id,)).fetchone()["n"]==0
