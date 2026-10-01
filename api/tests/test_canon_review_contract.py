"""Current-turn contracts consumed by the web's latest-question review controls.

These exercise the real conversation/store boundary without generating media.
The full environment repair and history tests live in test_marketing.py.
"""
from __future__ import annotations

from copy import deepcopy

import pytest

from app import campaign, config, store
from app.schemas import ArtifactEnvelope, CanonSheet, UserEvent


@pytest.fixture
def canon_review(monkeypatch):
    monkeypatch.setattr(config, "MOCK_MEDIA", True)
    monkeypatch.setattr(campaign, "_WORKSPACES", {})

    def no_work(*args, **kwargs):
        pytest.fail("A canon clarification must not start a job or render")

    monkeypatch.setattr(campaign, "_spawn", no_work)
    monkeypatch.setattr(campaign, "generate", no_work)
    created = campaign.start_campaign("Canon review contract")
    tid = created["thread"]["id"]
    product = CanonSheet(
        id="@product-current", kind="product", label="Product", brief="Blue shirt",
        sheet_asset_id="ast_product_current", asset_ids=["ast_product_current"],
    ).model_dump(mode="json")
    current = None
    for revision in ("old", "current"):
        environment = CanonSheet(
            id=f"@room-{revision}", kind="environment", label="Room", brief="Empty studio",
            sheet_asset_id=f"ast_room_{revision}", asset_ids=[f"ast_room_{revision}"],
        ).model_dump(mode="json")
        current = {
            "sheets": [deepcopy(product), environment],
            "board": {"version": 1, "shots": [{
                "slot": "hero", "product_refs": [product["id"]],
                "env_refs": [environment["id"]],
            }]},
        }
        campaign._say(
            tid, "Review the saved sheets.",
            [ArtifactEnvelope(
                type="canon_sheet", id="canon", title=f"Canon {revision}",
                payload=deepcopy(current),
                actions=campaign._actions(("approve_canon", "Approve canon", "primary")),
            )], question="Approve these sheets?",
        )
    store.set_thread_stage(tid, "canon")
    campaign._ws(tid).update(canon=deepcopy(current["sheets"]), board=deepcopy(current["board"]))
    return tid, current


@pytest.mark.parametrize("restart", [False, True], ids=["warm", "after-reload"])
def test_canon_clarification_keeps_current_actions_and_current_assets(canon_review, restart):
    tid, current = canon_review
    history = deepcopy(store.get_messages(tid))
    if restart:
        campaign._WORKSPACES.clear()

    campaign.handle_event(UserEvent(
        thread_id=tid, type="text", text="Why is there a bottle in this background?",
    ))

    messages = store.get_messages(tid)
    assert messages[:-2] == history, "Clarifying must not rewrite review history"
    assert messages[-2]["role"] == "user" and messages[-1]["role"] == "agent"
    latest = messages[-1]["envelope"]
    question = latest["question"]
    assert question and question["free_text"] is True
    artifacts = latest["artifacts"]
    assert len(artifacts) == 1 and artifacts[0]["type"] == "canon_sheet"
    card = artifacts[0]
    assert card["payload"]["sheets"] == current["sheets"]
    assert card["payload"]["board"] == current["board"]

    # The frontend filters card controls by BOTH current artifact id and event.
    offered = {(o["artifact_id"], o["event"]) for o in question["options"]}
    declared = {(card["id"], a["event"]) for a in card["actions"]}
    assert offered == declared == {
        ("canon", "approve_canon"), ("canon", "resheet_canon"), ("canon", "skip_canon"),
    }
    assert all(o["label"] for o in question["options"])
    assert next(o for o in question["options"] if o["event"] == "approve_canon")["primary"] is True
    assert store.get_thread(tid)["stage"] == "canon"


def test_clarification_cannot_reactivate_a_previous_canon_gate(canon_review):
    tid, _ = canon_review
    store.set_thread_stage(tid, "keyframes")
    campaign._hint(tid, "Review the current keyframes.")
    latest = store.get_messages(tid)[-1]["envelope"]
    assert latest["question"]["options"] == []
    assert latest["artifacts"] == []
    assert store.get_thread(tid)["stage"] == "keyframes"
