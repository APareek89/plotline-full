"""Canonical prepared campaign: real review workflow, permanently free mode."""
from __future__ import annotations
from dataclasses import replace
import threading

_creation_locks = [threading.Lock() for _ in range(64)]
from app import campaign, store
from app.execution import execution_scope, require_execution
from app.schemas import CampaignContext

EXAMPLES = [{"id": "ceramic-mugs", "title": "Ceramic mug image campaign",
             "description": "A prepared product and audience. Walk every review gate with illustrative sample output and placeholder media.",
             "prepared": True, "cached": True}]

def create(identifier: str) -> dict:
    actor = require_execution()
    # One ASGI process owns campaign jobs. Fixed stripes bound lock memory and
    # serialize duplicate example requests without blocking unrelated owners.
    with _creation_locks[int(actor.owner_id.replace("-", ""), 16) % 64]:
        return _create(identifier)

def _create(identifier: str) -> dict:
    if identifier != "ceramic-mugs":
        raise ValueError("Prepared example not found")
    actor = require_execution()
    # One existing prepared campaign per owner; repeated button clicks cannot
    # multiply paid/free assets or disk consumption.
    for row in store.list_series():
        existing = store.get_series(row["id"])
        if existing and existing.get("mode") == "cached":
            threads = store.get_series_threads(row["id"])
            if threads:
                return {"campaign_id": row["id"], "thread": threads[0], "cached": True, "prepared": True}
    started = campaign.start_campaign("Prepared ceramic mug campaign")
    cid, tid = started["campaign_id"], started["thread"]["id"]
    store.mark_cached_example(cid)
    with execution_scope(replace(actor, campaign_id=cid, thread_id=tid, mode="cached")):
        # This is canonical server input, not a caller-supplied provider bypass.
        # It does not approve any review gate on the user's behalf.
        for text in ("We sell ceramic travel mugs.",
                     "An awareness campaign for commuters on Instagram feed, one image.",
                     "Our brand palette is navy and cream, with no marketing claims."):
            store.append_message(tid, "user", {"thread_id": tid, "type": "text", "text": text})
            campaign._intake_turn(tid, cid, text)
        context = CampaignContext.model_validate(store.get_series(cid)["context"])
        if campaign.missing_blocks(context):
            raise RuntimeError("Prepared input could not be restored")
    return {**started, "cached": True, "prepared": True}
