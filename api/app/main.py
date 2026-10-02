"""plotline-api — orchestrator + agents (§7 build handoff: Claude Code lane).

Consumes the plotline-rag HTTP contract; does not embed, index, or query
vectors itself. Run: uvicorn app.main:app --port 8600
"""
from __future__ import annotations

import asyncio
import os
import json
import re
import shutil
from pathlib import Path
from typing import Any, Literal, Optional

from fastapi import Body, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, ValidationError

from app import brand_extract, campaign, config, store, threadkit
from app import auth as portfolio_auth, database
from app import examples, usage
from app.execution import fixture_mode, owner_directory, require_execution
from app import seats as seats_mod
from app.agents.runner import AgentHardFail
from app.rag_client import RagUnavailable, rag
from app.schemas import CreatorContext, UserEvent

app = FastAPI(title="plotline-api", version="0.1.0")
app.middleware("http")(portfolio_auth.middleware)


@app.on_event("startup")
def _rag_startup_check() -> None:
    """Log the RAG manifest at boot. Non-fatal here — evidence-requiring flows
    re-check via rag.ensure_ready() and fail loudly if the service is down."""
    import logging
    if not fixture_mode():
        portfolio_auth.secret()
        database.ready()

    if not config.RAG_ENABLED:
        logging.getLogger("plotline.rag").warning(
            "retrieval DISABLED (PLOTLINE_RAG_ENABLED=0) — plan generation will refuse to run"
        )
        return
    try:
        rag.ensure_ready()
    except RagUnavailable as exc:
        logging.getLogger("plotline.rag").warning("plotline-rag not reachable at startup: %s", exc)

_extra_origins = [o.strip() for o in os.environ.get("PLOTLINE_CORS_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3100", "http://127.0.0.1:3100", *_extra_origins],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, Any]:
    if not fixture_mode():
        database.ready()
        if config.RAG_ENABLED:
            try:
                rag.ensure_ready()
            except RagUnavailable:
                raise HTTPException(503, "Required retrieval is unavailable") from None
        return {"ok": True, "service": "plotline-api", "auth": True,
                "mock_llm": config.MOCK_LLM, "media_mock": config.MOCK_MEDIA}
    rag_status: dict[str, Any]
    try:
        rag_status = rag.health()
    except RagUnavailable as exc:
        rag_status = {"error": str(exc)}
    rag_status["enabled"] = config.RAG_ENABLED
    rag_status["allow_seed_evidence"] = config.ALLOW_SEED_EVIDENCE
    return {
        "service": "plotline-api",
        "mock_llm": config.MOCK_LLM,
        "media_mock": config.MOCK_MEDIA,
        # real mode with no key is a broken deployment — say so here rather
        # than letting the first campaign discover it
        "llm_unavailable": config.llm_unavailable_reason(),
        "models": {
            "planner": config.PLANNER_MODEL,
            "feedback": config.FEEDBACK_MODEL,
            "intake": config.INTAKE_MODEL,
        },
        "rag": rag_status,
    }


@app.get("/healthz")
def healthz():
    return health()


# ----------------------------------------------------------------- profile --


class ProfileBody(BaseModel):
    niche: Optional[str] = None
    tone_rules: list[str] = Field(default_factory=list)
    banned_topics: list[str] = Field(default_factory=list)
    capacity: Optional[str] = None
    style_prefs: list[str] = Field(default_factory=list)


@app.get("/api/profile")
def get_profile() -> dict[str, Any]:
    return store.get_profile()


@app.get("/api/examples")
def prepared_examples():
    return {"examples": examples.EXAMPLES}


class ExampleBody(BaseModel):
    id: str


@app.post("/api/examples")
def prepare_example(body: ExampleBody):
    try:
        return examples.create(body.id)
    except ValueError:
        raise HTTPException(404, "Prepared example not found") from None


@app.get("/api/usage")
def owner_usage():
    actor = require_execution()
    if fixture_mode():
        return {"rows": [], "media_allowance": usage.owner_media_limit(), "owner_text_usd_limit": "1.00"}
    with database.connection(owner_id=actor.owner_id) as conn:
        rows = conn.execute("""SELECT id,kind,provider,model,status,reserved_usd,actual_usd,consumed_credits,
          input_tokens,output_tokens,cached_input_tokens,reasoning_output_tokens,created_at
          FROM usage WHERE owner_id=%s ORDER BY created_at DESC LIMIT 100""", (actor.owner_id,)).fetchall()
    return {"rows": rows, "media_allowance": usage.owner_media_limit(), "owner_text_usd_limit": os.getenv("PLOTLINE_OWNER_BUDGET_USD", "1.00"),
            "media_capacity": usage.media_capacity(),
            "media_usd_note": "Media operation counts are bounded; a dollar conversion is not verified."}


@app.put("/api/profile")
def put_profile(body: ProfileBody) -> dict[str, Any]:
    store.save_profile(body.model_dump())
    return store.get_profile()


# ----------------------------------------------------------------- uploads --


@app.post("/api/uploads")
async def upload_file(
    file: UploadFile = File(...),
    kind: str = Form("other"),
    series_id: Optional[str] = Form(None),
) -> dict[str, Any]:
    if series_id and not store.get_series(series_id):
        raise HTTPException(404, "campaign not found")
    safe_name = Path((file.filename or "upload").replace("\\", "/")).name[:180]
    if kind not in ("other", "image", "logo", "policy", "product", "brand", "brand_asset"):
        raise HTTPException(422, "Unsupported upload kind")
    if not safe_name or Path(safe_name).suffix.lower() not in (".png", ".jpg", ".jpeg", ".webp", ".pdf", ".txt", ".md"):
        raise HTTPException(422, "Use PNG, JPEG, WebP, PDF or text files")
    dest = owner_directory("uploads") / f"{store.new_id('f')}_{safe_name}"
    size = 0
    try:
        with dest.open("xb") as out:
            os.chmod(dest, 0o600)
            while chunk := await file.read(64 * 1024):
                size += len(chunk)
                if size > 15 * 1024 * 1024:
                    raise HTTPException(413, "Upload exceeds 15 MiB")
                out.write(chunk)
        if not size:
            raise HTTPException(422, "Empty upload")
    except BaseException:
        dest.unlink(missing_ok=True)
        raise
    upload_id = store.add_upload(safe_name, kind, str(dest), file.content_type, series_id)
    return {"id": upload_id, "filename": safe_name, "kind": kind}


@app.get("/api/uploads")
def list_uploads() -> list[dict[str, Any]]:
    return [{k: row.get(k) for k in ("id", "filename", "kind", "content_type", "series_id", "created_at")} for row in store.list_uploads()]


# ------------------------------------------------------------------ series --


class SeriesCreateBody(BaseModel):
    form: dict[str, Any]
    upload_ids: list[str] = Field(default_factory=list)


class ContextUpdateBody(BaseModel):
    form: dict[str, Any]
    upload_ids: list[str] = Field(default_factory=list)


# -------------------------------------------------------------- inspiration --


# -------------------------------------------- Addendum-01 §01/§02: threads --


@app.get("/api/threads/{thread_id}")
def get_thread(thread_id: str, after_seq: int = 0) -> dict[str, Any]:
    thread = store.get_thread(thread_id)
    if not thread:
        raise HTTPException(404, "thread not found")
    series = store.get_series(thread["series_id"])
    working = threadkit.working_step(thread_id)
    job = store.last_job_status(thread_id)
    return {
        **thread,
        "series_name": series["name"] if series else "",
        "cached": bool(series and series.get("mode") == "cached"),
        "prepared": bool(series and series.get("mode") == "cached"),
        "working": working,  # labeled step, never a bare spinner
        "job_status": "interrupted" if job and job["status"] == "running" and not working else (job or {}).get("status"),
        "recovery": ({"event":"retry", "artifact_id":"recovery", "label":"Retry interrupted step",
                      "warning":"Saved work is retained. Earlier provider work may have been charged; review usage before retrying."}
                     if not working and job and job["status"] in ("running","failed","interrupted") and campaign.recovery_job(thread) else None),
        "messages": store.get_messages(thread_id, after_seq=after_seq),
        "concept_states": store.get_concept_states(thread["series_id"]),
    }


@app.post("/api/threads/{thread_id}/events")
def post_event(thread_id: str, body: UserEvent) -> dict[str, Any]:
    if body.thread_id != thread_id:
        raise HTTPException(422, "thread_id mismatch")
    thread = store.get_thread(thread_id)
    if not thread:
        raise HTTPException(404, "thread not found")
    if thread["kind"] != "campaign":
        # Content Studio and Creative Studio threads are gone. An old row can
        # still be in a dev database, so say what happened rather than 500.
        raise HTTPException(410, f"thread kind {thread['kind']!r} is no longer supported")
    if body.text and len(body.text) > 16000 or len(body.upload_ids) > 8:
        raise HTTPException(413, "Message exceeds the campaign limit")
    if body.upload_ids and len(store.get_uploads(list(set(body.upload_ids)))) != len(set(body.upload_ids)):
        raise HTTPException(404, "upload not found")
    try:
        campaign.handle_event(body)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    return {"ok": True}


@app.get("/api/threads/{thread_id}/artifacts/{artifact_id}/activity")
def artifact_activity(thread_id: str, artifact_id: str) -> list[dict[str, Any]]:
    return store.get_artifact_activity(thread_id, artifact_id)


# ----------------------------- Addendum-02: Creative Studio + Post Cards ----


class ProduceBody(BaseModel):
    option: str = "A"


@app.get("/api/assets/{asset_id}")
def asset_meta(asset_id: str):
    """What the artifact detail rail reads: the prompt that made this, the
    settings it was made with, and what it cost. Everything here is already in
    the generation record — the panel shows it, it does not re-derive it."""
    asset = store.get_asset(asset_id)
    if not asset:
        raise HTTPException(404, "asset not found")
    params = asset.get("params") or {}
    return {
        "id": asset["id"], "kind": asset["kind"], "slot": asset["slot"],
        "status": asset["status"], "cost": asset["cost"],
        "name": params.get("name"),
        "prompt": params.get("prompt"),
        "provider": params.get("provider") or ("sample" if params.get("model") == "mock" else str(params.get("model", "")).split(":", 1)[0] if str(params.get("model", "")).startswith(("pixelbin:", "fal:")) else None),
        "settings": {
            "model": params.get("model"),
            "aspect_ratio": params.get("ratio"),
            "resolution": params.get("resolution"),
            "seed": params.get("seed"),
        },
        "refs": params.get("refs") or [],
        "refs_dropped": params.get("refs_dropped") or [],
        "file_url": f"/api/assets/{asset['id']}/file",
    }


class AssetPatch(BaseModel):
    name: str


@app.patch("/api/assets/{asset_id}")
def asset_rename(asset_id: str, body: AssetPatch):
    if not store.set_asset_name(asset_id, body.name):
        raise HTTPException(404, "asset not found")
    return {"ok": True, "name": body.name.strip()}


@app.delete("/api/assets/{asset_id}")
def asset_delete(asset_id: str):
    if not store.delete_asset(asset_id):
        raise HTTPException(404, "asset not found")
    return {"ok": True}


@app.get("/api/assets/{asset_id}/file")
def asset_file(asset_id: str):
    from fastapi.responses import FileResponse

    asset = store.get_asset(asset_id)
    if not asset:
        raise HTTPException(404, "asset not found")
    media_types = {"svg": "image/svg+xml", "png": "image/png", "mp4": "video/mp4",
                   "wav": "audio/wav", "mp3": "audio/mpeg"}
    path = store.file_path(asset, "assets")
    ext = path.suffix.lstrip(".")
    return FileResponse(path, media_type=media_types.get(ext, "application/octet-stream"), headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})


@app.get("/api/threads/{thread_id}/generation-log")
def generation_log(thread_id: str) -> list[dict[str, Any]]:
    return store.get_generation_log(thread_id)


class PromptEditBody(BaseModel):
    prompt_text: str


@app.post("/api/threads/{thread_id}/prompts/{slot}")
def edit_prompt(thread_id: str, slot: str, body: PromptEditBody) -> dict[str, Any]:
    """§08 rule 7: the user's edited prompt is used VERBATIM downstream."""
    ws = threadkit._pending(thread_id)
    if slot not in ws.get("prompts", {}):
        raise HTTPException(404, f"no pending prompt for slot {slot}")
    ws["prompts"][slot] = body.prompt_text
    store.log_generation(thread_id, None, "edit_prompt", prompt=body.prompt_text)
    store.log_artifact_activity(thread_id, f"prompt_{slot}", "refined", "user edited prompt")
    return {"slot": slot, "prompt_text": body.prompt_text}


# --------------------------- Addendum-03: Marketing Studio — campaigns ------



def _campaign_or_404(campaign_id: str) -> dict[str, Any]:
    series = store.get_series(campaign_id)  # a campaign IS a series row
    if not series:
        raise HTTPException(404, "campaign not found")
    return series


class CampaignCreateBody(BaseModel):
    name: str


@app.post("/api/campaigns")
def create_campaign(body: CampaignCreateBody) -> dict[str, Any]:
    """Step 0: the blank landing's only block. Name is the Campaigns-tab
    handle and the thread numbering prefix, so it must be unique."""
    name = body.name.strip()
    if len(name) > 120:
        raise HTTPException(422, "Campaign name must be at most 120 characters")
    if not name:
        raise HTTPException(422, "Naming is required: give the campaign a name")
    if any(row["name"].strip().lower() == name.lower() for row in list_campaigns()):
        raise HTTPException(422, f"A campaign named '{name}' already exists — pick another name")
    return campaign.start_campaign(name)


@app.get("/api/campaigns")
def list_campaigns() -> list[dict[str, Any]]:
    """My Campaigns rows. Campaign series are the ones carrying a campaign
    thread; thread_id is the latest one, which the Open CTA lands on."""
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for thread in store.list_threads(kind="campaign"):  # newest first
        series_id = thread["series_id"]
        if series_id in seen:
            continue
        seen.add(series_id)
        series = store.get_series(series_id)
        if not series:
            continue
        context = series["context"]
        thumbnail = next((a["id"] for a in store.list_assets(thread["id"]) if a.get("kind") in ("image", "svg", "png")), None)
        for card in store.list_ad_cards(series_id):
            for media in card.get("media") or []:
                match=re.fullmatch(r"/api/assets/([A-Za-z0-9_-]+)/file",str(media.get("url", "")))
                if media.get("kind")=="image" and match and store.get_asset(match.group(1)):
                    thumbnail=match.group(1);break
            else:continue
            break
        rows.append({
            "id": series_id,
            "name": series["name"],
            "objective": (context.get("campaign") or {}).get("objective"),
            "status": series["status"],
            "creative_count": len(store.list_ad_cards(series_id)),
            "spend_credits": store.campaign_media_credits(series_id),
            "estimated_spend_usd": store.campaign_spend(series_id),
            "thread_id": thread["id"],
            "thumbnail_asset_id": thumbnail,
            "cached": series.get("mode") == "cached",
        })
    return rows


@app.get("/api/campaigns/{campaign_id}")
def get_campaign(campaign_id: str) -> dict[str, Any]:
    series = _campaign_or_404(campaign_id)
    return {
        "id": campaign_id,
        "name": series["name"],
        "context": series["context"],
        "status": series["status"],
        "context_filled": campaign.context_filled(series["context"]),
        "threads": store.get_series_threads(campaign_id),
        "ad_cards": store.list_ad_cards(campaign_id),
    }


@app.delete("/api/campaigns/{campaign_id}")
def delete_campaign(campaign_id: str) -> dict[str, Any]:
    """Remove a campaign and everything hanging off it.

    The grid needs a working per-card action, and until now there was none —
    which is why a dev database accumulated 31 QA campaigns with no way to
    clear them. Deletion is genuinely destructive, so it is a DELETE with no
    'archive' fallback pretending to be one: the row is gone, and the response
    says what went with it rather than a bare ok.
    """
    _campaign_or_404(campaign_id)
    removed = store.delete_series(campaign_id)
    return {"deleted": campaign_id, **removed}


class BrandFetchBody(BaseModel):
    url: str


@app.post("/api/campaigns/{campaign_id}/brand/fetch")
def brand_fetch(campaign_id: str, body: BrandFetchBody) -> dict[str, Any]:
    """Fetch from URL — a SYSTEM extractor pipeline, never an agent tool.
    Returns candidates only: nothing is saved until the user confirms the card."""
    _campaign_or_404(campaign_id)
    url = body.url.strip()
    if not url:
        raise HTTPException(422, "Brand URL is required to fetch")
    return brand_extract.extract(url)


def _pdf_text(raw: bytes) -> str:
    """Best-effort PDF text with the stdlib only (no PDF library in the venv):
    inflate the content streams and take the string operands. Deliberately
    crude — enough for a typed policy, empty for a scanned one."""
    import zlib

    chunks: list[bytes] = []
    if len(raw) > 15 * 1024 * 1024:
        raise HTTPException(413, "Policy file exceeds 15 MiB")
    expanded = 0
    for index, match in enumerate(re.finditer(rb"stream\r?\n(.*?)endstream", raw, re.S)):
        if index >= 200:
            raise HTTPException(413, "Policy document has too many streams")
        blob = match.group(1)
        try:
            decoder = zlib.decompressobj()
            blob = decoder.decompress(blob, 4 * 1024 * 1024 + 1)
            if decoder.unconsumed_tail or len(blob) > 4 * 1024 * 1024:
                raise HTTPException(413, "Policy content exceeds extraction limit")
        except zlib.error:
            if b"Tj" not in blob and b"TJ" not in blob:
                continue  # binary image/font stream, not page text
        expanded += len(blob)
        if expanded > 8 * 1024 * 1024:
            raise HTTPException(413, "Policy content exceeds extraction limit")
        chunks += re.findall(rb"\((?:\\.|[^\\()])*\)", blob)
    text = b" ".join(c[1:-1] for c in chunks).decode("latin-1", "replace")
    return re.sub(r"[ \t]+", " ", re.sub(r"\\([()\\])", r"\1", text)).strip()


def _policy_text(upload_id: Optional[str]) -> tuple[str, list[str]]:
    """Text of the uploaded Brand Policy Document. Unreadable file → empty
    text plus an honest note; never invented content."""
    if not upload_id:
        return "", ["no Brand Policy Document uploaded — candidates come from the product description only"]
    rows = store.get_uploads([upload_id])
    if not rows:
        return "", [f"policy upload {upload_id} not found"]
    upload = rows[0]
    try:
        path = store.file_path(upload, "uploads")
    except FileNotFoundError:
        return "", [f"policy file missing on disk ({upload['filename']})"]
    if path.stat().st_size > 15 * 1024 * 1024:
        raise HTTPException(413, "Policy file exceeds 15 MiB")
    suffix = path.suffix.lower()
    if suffix in (".txt", ".md", ".markdown"):
        return path.read_text(encoding="utf-8", errors="replace"), []
    if suffix == ".pdf":
        text = _pdf_text(path.read_bytes())
        if not text:
            return "", [f"couldn't read text out of {upload['filename']} "
                        "(scanned or encoded PDF) — add the claims by hand"]
        return text, [f"{upload['filename']} read with a best-effort PDF parser — check the candidates"]
    return "", [f"unsupported policy format '{suffix or 'unknown'}' — upload .txt, .md or .pdf"]


@app.post("/api/campaigns/{campaign_id}/claims/extract")
def claims_extract(campaign_id: str) -> dict[str, Any]:
    """Compliance without a new form field: CANDIDATE claims + banned words
    from the policy doc and product description. The user one-tap confirms
    them in the Brand card — the confirmed list is the source of truth."""
    series = _campaign_or_404(campaign_id)
    context = series["context"]
    brand, product = context.get("brand") or {}, context.get("product") or {}
    policy_text, notes = _policy_text(brand.get("policy_upload_id"))
    out = brand_extract.extract_claims(policy_text, product.get("description", ""))
    if not out["approved_claims"] and not out["banned_words"]:
        notes.append("nothing extractable — add claims and banned words yourself")
    return {**out, "notes": notes}


@app.post("/api/campaigns/{campaign_id}/start")
def start_campaign(campaign_id: str) -> dict[str, Any]:
    """Step 3 kick-off: all cards ✓ → rumination runs in the thread."""
    series = _campaign_or_404(campaign_id)
    blocked = config.llm_unavailable_reason()
    if blocked:
        raise HTTPException(503, blocked)
    missing = campaign.missing_blocks(series["context"])
    if missing:
        raise HTTPException(422, f"Campaign context incomplete — still needed: {', '.join(missing)}")
    try:
        campaign.begin_rumination(campaign_id)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return {"ok": True}


@app.get("/api/campaigns/{campaign_id}/settings")
def get_campaign_settings(campaign_id: str) -> dict[str, Any]:
    """Review policy + council roster for one campaign.

    Always answers, even for a campaign that has never been configured — the
    defaults ARE the product's behaviour, so an absent row is a full answer
    rather than a missing one.
    """
    _campaign_or_404(campaign_id)
    policy = campaign._policy_of(campaign_id)
    stored = store.get_campaign_settings(campaign_id)
    return {
        "review_policy": policy.model_dump(mode="json"),
        "seats": stored.get("seats") or [],
        "gateable_stages": campaign.GATEABLE_STAGES,
        "presets": sorted(campaign.POLICY_PRESETS),
        "available_seats": sorted(seats_mod.available()),
    }


@app.patch("/api/campaigns/{campaign_id}/settings")
def patch_campaign_settings(campaign_id: str, body: dict[str, Any]) -> dict[str, Any]:
    """Merge-patch. Sending one setting never clears the others.

    Validation happens HERE, on write, so a bad gate combination or an unknown
    seat is refused while the user is looking at it — rather than degrading
    silently in the middle of a paid run.
    """
    _campaign_or_404(campaign_id)
    patch: dict[str, Any] = {}

    if "preset" in body:
        try:
            patch["review_policy"] = campaign.policy_from_preset(
                body["preset"]).model_dump(mode="json")
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    if "review_policy" in body:
        # merge onto what is already there, so PATCHing one count keeps the gates
        current = campaign._policy_of(campaign_id).model_dump(mode="json")
        incoming = body["review_policy"] or {}
        merged = {**current, **incoming}
        if "gates" in incoming:
            merged["gates"] = {**current["gates"], **(incoming["gates"] or {})}
        try:
            patch["review_policy"] = campaign.ReviewPolicy.model_validate(
                merged).model_dump(mode="json")
        except ValidationError as exc:
            raise HTTPException(422, _first_error(exc)) from exc

    if "seats" in body:
        wanted = body["seats"] or []
        if not isinstance(wanted, list):
            raise HTTPException(422, "seats must be a list of seat slugs")
        try:
            seats_mod.resolve(wanted)
        except seats_mod.SeatConfigError as exc:
            raise HTTPException(422, str(exc)) from exc
        patch["seats"] = wanted

    if not patch:
        raise HTTPException(422, "nothing to update — send preset, review_policy or seats")

    store.update_campaign_settings(campaign_id, patch)
    return get_campaign_settings(campaign_id)


def _first_error(exc: ValidationError) -> str:
    """A pydantic error dump is unreadable in a toast. Surface the message the
    hard-rule validators were written to say."""
    for err in exc.errors():
        msg = err.get("msg", "")
        return msg.removeprefix("Value error, ")
    return str(exc)


@app.get("/api/canon")
def list_canon(kind: Optional[str] = None) -> dict[str, Any]:
    """The workspace canon library. Global by design — a sheet belongs to the
    workspace, not to the campaign that happened to create it first."""
    return {"sheets": store.list_canon_sheets(kind)}


@app.get("/api/canon/{sheet_id}")
def get_canon(sheet_id: str) -> dict[str, Any]:
    sheet = store.get_canon_sheet(sheet_id)
    if not sheet:
        raise HTTPException(404, f"no canon sheet {sheet_id}")
    return sheet


@app.delete("/api/canon/{sheet_id}")
def delete_canon(sheet_id: str) -> dict[str, Any]:
    """Deleting a sheet a campaign still references does NOT retroactively break
    that campaign — its shots hold the asset ids, not the sheet. What it costs is
    the reuse: the next campaign re-renders."""
    if not store.delete_canon_sheet(sheet_id):
        raise HTTPException(404, f"no canon sheet {sheet_id}")
    return {"ok": True, "deleted": sheet_id}


@app.get("/api/templates")
def templates() -> list[dict[str, Any]]:
    """Step 4: static samples from samples/templates/manifest.json. Empty
    until the owner drops files in — the picker then offers Skip only."""
    return campaign.templates()


# ------------------------------------------------- Addendum-03: ad cards ----


@app.get("/api/ad-cards")
def ad_cards(campaign_id: Optional[str] = None) -> list[dict[str, Any]]:
    return store.list_ad_cards(campaign_id)


@app.get("/api/ad-cards/{card_id}")
def ad_card(card_id: str) -> dict[str, Any]:
    card = store.get_ad_card(card_id)
    if not card:
        raise HTTPException(404, "ad card not found")
    return card


@app.get("/api/ad-cards/{card_id}/bundle")
def ad_card_bundle(card_id: str):
    """Export bundle — zip of media + copy_<platform>.txt + meta.json."""
    import io
    import zipfile

    card = store.get_ad_card(card_id)
    if not card:
        raise HTTPException(404, "ad card not found")
    naming = re.sub(r"[^A-Za-z0-9_.-]+", "_", card.get("naming") or card_id)
    if len(card.get("media") or []) > 30 or len(json.dumps(card)) > 2 * 1024 * 1024:
        raise HTTPException(413, "Bundle exceeds export limit")
    files = []
    total_bytes = 0
    for item in card.get("media") or []:
        url = item.get("url") or ""
        match = re.fullmatch(r"/api/assets/([A-Za-z0-9_-]+)/file", url)
        asset = store.get_asset(match.group(1)) if match else None
        if not asset:
            raise HTTPException(404, "Bundle asset not found")
        path = store.file_path(asset, "assets")
        total_bytes += path.stat().st_size
        if total_bytes > 96 * 1024 * 1024:
            raise HTTPException(413, "Bundle exceeds 96 MiB")
        files.append((item, path))
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for platform, text in (card.get("placements") or {}).items():
            zf.writestr(f"copy_{platform}.txt", text)
        zf.writestr("meta.json", json.dumps(card, indent=2, default=str))
        for m, p in files:
            zf.writestr(f"media/{naming}_{re.sub(r'[^A-Za-z0-9_.-]', '_', str(m['params'].get('prompt_id', p.stem)))}{p.suffix}", p.read_bytes())
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/zip",
                             headers={"Content-Disposition": f'attachment; filename="{card_id}.zip"'})


@app.post("/api/ad-cards/{card_id}/mark-live")
def mark_live(card_id: str) -> dict[str, Any]:
    """Live is a campaign-level fact too: the row in My Campaigns flips with
    the card, and Live campaigns start showing the results-paste nudge."""
    card = store.get_ad_card(card_id)
    if not card:
        raise HTTPException(404, "ad card not found")
    card["status"] = "live"
    store.save_ad_card(card)
    store.set_campaign_status(card["campaign_id"], "live")
    return card


# ------------------------------------------------------------------- runs ---


class RegenBody(BaseModel):
    feedback: str = ""


# ------------------------------------------------------ concept-level moves --


class ReorderBody(BaseModel):
    ordered_ids: list[str]


# -------------------------------------------------------------- performance --


class PerformanceBody(BaseModel):
    series_id: Optional[str] = None
    concept_id: Optional[str] = None
    platform: str
    views: Optional[int] = None
    retention_pct: Optional[float] = None
    saves: Optional[int] = None
    comments: Optional[int] = None
    shares: Optional[int] = None
    ctr_pct: Optional[float] = None
    notes: Optional[str] = None


@app.post("/api/performance")
def add_performance(body: PerformanceBody) -> dict[str, Any]:
    metrics = {k: v for k, v in body.model_dump().items() if k not in ("series_id", "concept_id", "platform") and v is not None}
    row_id = store.add_performance(body.series_id, body.concept_id, body.platform, metrics)
    return {"id": row_id}


@app.get("/api/performance")
def list_performance() -> list[dict[str, Any]]:
    return store.list_performance()


# --------------------------------------------------------- observability ----
# TEMPORARY debug surface. Returns the structured input and output of every
# agent node that ran for a thread, newest last, so a run can be inspected
# without tailing a JSONL file. Gated: it exposes full prompts and payloads, so
# it must never answer in a real deployment.


def _debug_enabled() -> bool:
    return config.MOCK_LLM or _truthy_env("PLOTLINE_DEBUG_OBSERVABILITY")


def _truthy_env(name: str) -> bool:
    import os
    return os.environ.get(name, "").strip().lower() in ("1", "true", "yes", "on")


def _read_runs() -> list[dict[str, Any]]:
    path = owner_directory("runs") / "agent_runs.jsonl"
    if not path.exists():
        return []
    runs: list[dict[str, Any]] = []
    buf = ""
    with path.open("rb") as source:
        source.seek(max(0, path.stat().st_size - 4 * 1024 * 1024))
        raw = source.read(4 * 1024 * 1024)
    for line in raw.decode(errors="replace").splitlines(True):
        buf += line
        try:
            row = json.loads(buf)
        except Exception:
            continue                       # a pretty-printed record spans lines
        buf = ""
        runs.append(row)
    return runs


@app.get("/api/agent-runs")
def all_agent_runs(limit: int = 200) -> dict[str, Any]:
    """Every node run, newest last, with the campaign each belongs to.

    Observability is its own surface, not a tab hanging off one thread: the
    question "which node failed" is usually asked ACROSS runs, and tying the
    view to a thread means you cannot see a run whose thread you have not
    opened."""
    if not _debug_enabled():
        raise HTTPException(404, "observability is disabled on this deployment")

    series_names = {row["id"]: row["name"] for row in store.list_series()}
    names = {
        t["id"]: series_names.get(t["series_id"], "")
        for t in store.list_threads()
    }

    limit = min(max(limit, 1), 500)
    runs = [row for row in _read_runs() if fixture_mode() or row.get("thread_id") in names]
    for row in runs:
        tid = row.get("thread_id")
        row["campaign_name"] = names.get(tid or "", None)
    return {"runs": runs[-limit:]}


def _provider_of(model: str) -> str:
    """Which provider served a render.

    New rows carry a "pixelbin:" / "fal:" prefix. Rows written before that
    prefix existed still name a fal slug ("fal-ai/nano-banana-2"), which is
    unambiguous — reading it is recovering a fact, not guessing one. Anything
    genuinely unrecognised stays "?" rather than being assigned a plausible
    provider, because a wrong attribution in a cost view is worse than none.
    """
    if ":" in model:
        return model.split(":", 1)[0]
    if model == "mock":
        return "mock"
    if model.startswith("fal-ai/"):
        return "fal"
    return "?"


@app.get("/api/media-runs")
def all_media_runs(limit: int = 200) -> dict[str, Any]:
    """Every media generation across all threads, newest first.

    The agent-runs surface answers "which NODE failed". This answers "which
    PROVIDER actually served that render, and what did it charge" — a distinct
    question since 2026-08-26, when PixelBin became primary and fal became the
    fallback. `model` carries its provider prefix, so a silent failover is
    visible in the row instead of being inferred from timing.

    Same gate as agent-runs: prompts travel in these rows.
    """
    if not _debug_enabled():
        raise HTTPException(404, "observability is disabled on this deployment")

    series_names = {row["id"]: row["name"] for row in store.list_series()}
    rows = store.recent_generations(min(max(limit, 1), 500))
    for row in rows:
        row["campaign_name"] = series_names.get(row.get("series_id") or "", None)
        row["provider"] = _provider_of(row.get("model") or "")
    spent = sum(float(r.get("cost") or 0) for r in rows)
    by_provider: dict[str, dict[str, Any]] = {}
    for row in rows:
        bucket = by_provider.setdefault(row["provider"], {"renders": 0, "usd": 0.0})
        bucket["renders"] += 1
        bucket["usd"] = round(bucket["usd"] + float(row.get("cost") or 0), 4)
    return {"runs": rows, "total_usd": round(spent, 4), "by_provider": by_provider}
