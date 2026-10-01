"""Actual background-job outcome contract; no provider or network work."""
from types import SimpleNamespace
from app import campaign, store


def test_caught_stage_failure_is_persisted_failed_and_next_job_can_finish(monkeypatch):
    campaign._WORKSPACES.clear()
    started = campaign.start_campaign("Caught stage error")
    tid = started["thread"]["id"]
    monkeypatch.setattr(campaign.threading, "Thread", lambda *, target, daemon: SimpleNamespace(start=target))
    observed = []
    finish = store.finish_run
    def record(run_id, status, error=None):
        observed.append((run_id, status, error))
        return finish(run_id, status, error)
    monkeypatch.setattr(store, "finish_run", record)
    def caught_stage():
        campaign._fail(tid, "Synthetic stage failed", "Synthetic failure")
    campaign._spawn(tid, caught_stage)
    assert observed[-1][1:] == ("failed", "stage_failed")
    row = store.get_conn().execute("SELECT status,error FROM pipeline_runs WHERE id=?", (observed[-1][0],)).fetchone()
    assert dict(row) == {"status": "failed", "error": "stage_failed"}
    assert tid not in campaign._working and not campaign._owner_jobs
    campaign._spawn(tid, lambda: None)
    assert observed[-1][1:] == ("finished", None)
    assert tid not in campaign._working and not campaign._owner_jobs
