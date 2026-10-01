"""PixelBin media transport (primary provider, owner decision 2026-08-26).

The published SDK is Node; this service is Python, so the REST contract is
spoken directly. Paths and auth were read off `@pixelbin/admin` rather than
guessed:

    create  POST /service/platform/transformation/v1.0/predictions/{plugin}/{op}
            multipart/form-data · Authorization: Bearer <token> · → {_id}
    poll    GET  /service/platform/transformation/v1.0/predictions/{requestId}
            → {status: PENDING|SUCCESS|FAILURE, output: [url, ...]}

A prediction NAME is "<plugin>_<operation>" split on the FIRST underscore, so
`nanoBanana2_generate` → plugin `nanoBanana2`, op `generate`, and `erase_bg` →
plugin `erase`, op `bg`. Splitting on the last underscore would break the
second form, which is why this is a helper and not an inline `rsplit`.

This module raises `MediaError` and nothing else, so `media.py` can treat a
PixelBin failure and a fal failure identically when it decides to fall back.
"""
from __future__ import annotations

import base64
import json
import logging
import re
import time
from typing import Any, Optional

import httpx

from app import config

logger = logging.getLogger("plotline.media.pixelbin")

_PREDICT = "/service/platform/transformation/v1.0/predictions"


class PixelbinError(RuntimeError):
    """Transport or provider failure. `policy=True` → the model declined the
    prompt, which must never be retried against the same provider."""

    def __init__(self, message: str, policy: bool = False, safe_to_fallback: bool = False):
        self.policy = policy
        self.safe_to_fallback = safe_to_fallback
        super().__init__(message)


def configured() -> bool:
    """True when a real PixelBin call is possible. Checked BEFORE routing so a
    missing token reads as 'not configured' rather than a runtime 401."""
    return bool(config.PIXELBIN_API_TOKEN.strip())


def split_name(name: str) -> tuple[str, str]:
    """'nanoBanana2_generate' → ('nanoBanana2', 'generate')."""
    if "_" not in name:
        raise PixelbinError(f"prediction name {name!r} is not '<plugin>_<operation>'")
    plugin, _, operation = name.partition("_")
    return plugin, operation


def _headers() -> dict[str, str]:
    """Platform auth is `Bearer base64(token)`, NOT the raw token.

    The /service/public/* endpoints accept the raw value, which makes this easy
    to get wrong: listing models and reading schemas both work, and only
    generation — the call that costs money — comes back 401. Read off
    PlatformAPIClient.execute() in @pixelbin/admin, which base64s the access
    token before prefixing "Bearer ".
    """
    if not configured():
        raise PixelbinError(
            "PIXELBIN_API_TOKEN is not set — PixelBin generation unavailable "
            "(set MOCK_MEDIA=1 to develop without it, or PLOTLINE_MEDIA_PROVIDER=fal)", safe_to_fallback=True
        )
    encoded = base64.b64encode(config.PIXELBIN_API_TOKEN.strip().encode()).decode()
    return {"Authorization": f"Bearer {encoded}"}


def _as_form(payload: dict[str, Any]) -> list[tuple[str, str]]:
    """Multipart fields, named `input.<key>` — NOT the bare key.

    The endpoint validates against `/input`, so a flat `prompt` field comes back
    as "missingProperty: prompt" while the value is sitting right there in the
    body. Read off Predictions.create() in @pixelbin/admin, which builds
    `const fieldName = \\`input.${key}\\``.

    A list value is repeated under the same field name; a JSON-encoded array is
    silently ignored, so this shape is not cosmetic either.
    """
    fields: list[tuple[str, str]] = []
    for key, value in payload.items():
        if value is None:
            continue
        field = f"input.{key}"
        if isinstance(value, (list, tuple)):
            fields.extend((field, str(v)) for v in value if v is not None)
        elif isinstance(value, bool):
            fields.append((field, "true" if value else "false"))
        else:
            fields.append((field, str(value)))
    return fields


def submit_and_wait(name: str, payload: dict[str, Any], timeout_s: float = 600) -> list[str]:
    """One submit, fixed authenticated polling, bounded response, no hidden retry."""
    from app import media_transport as transport
    plugin, operation = split_name(name)
    if not re.fullmatch(r"[A-Za-z0-9]+",plugin) or not re.fullmatch(r"[A-Za-z0-9_]+",operation) or config.PIXELBIN_DOMAIN!="https://api.pixelbin.io":
        raise PixelbinError("invalid PixelBin endpoint")
    headers=_headers();transport.before_submit(payload)
    try:
        sub=transport.request("POST",f"https://api.pixelbin.io{_PREDICT}/{plugin}/{operation}",headers=headers,
                              files=[(k,(None,v)) for k,v in _as_form(payload)],timeout=60)
        if sub.status_code in (400,401,402,403,404,422,429):
            transport.rejected()
            raise PixelbinError("PixelBin rejected the request",policy=transport.is_policy(sub),
                                safe_to_fallback=sub.status_code in (401,402,403,404,429))
        sub.raise_for_status();job=sub.json();request_id=job.get('_id') or job.get('requestId') or job.get('id')
        transport.accepted(request_id);deadline=time.monotonic()+min(timeout_s,900)
        while time.monotonic()<deadline:
            st=transport.request('GET',f'https://api.pixelbin.io{_PREDICT}/{request_id}',headers=headers);st.raise_for_status()
            data=st.json();status=str(data.get('status','')).upper()
            if status=='SUCCESS':
                output=data.get('output') or [];output=[output] if isinstance(output,str) else output
                urls=[u for u in output if isinstance(u,str) and u.startswith('https://')]
                transport.completed(data.get("consumedCredits"))
                if not urls:raise PixelbinError('PixelBin succeeded without an output URL')
                return urls
            if status in ('FAILURE','FAILED','ERROR','CANCELLED'):
                raise PixelbinError('PixelBin job failed; charge status retained',policy=transport.is_policy(st))
            time.sleep(3)
        raise PixelbinError('PixelBin job timed out; it may still complete and be charged')
    except PixelbinError:raise
    except Exception:raise PixelbinError('PixelBin completion unknown; it may have been charged') from None


# Per-model capability table, read from the LIVE schema endpoint on 2026-08-26:
#   GET /service/public/transformation/v1.0/predictions/schema/{name}
#
# These models do NOT share a parameter set, and the differences are not
# cosmetic — video takes `image_urls` where image takes `images`, `duration` is
# a STRING enum rather than a number, and nanoBanana has no output_resolution at
# all. Sending a parameter a model does not declare turns a 400 into "the
# provider is broken", which is the dishonest-error class this codebase keeps
# stamping out. Re-check with `scripts/`-less curl against the schema URL above
# if a model is added.
_CAPS: dict[str, dict[str, Any]] = {
    "nanoBanana_generate": {
        "image_field": "images",
        "ratios": {"auto", "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"},
        "resolution": None,
    },
    "nanoBanana2_generate": {
        "image_field": "images",
        "ratios": {"1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9",
                   "4:1", "1:4", "1:8", "8:1"},
        "resolution": {"0.5K", "1K", "2K", "4K"},
    },
    "nanoBananaPro_generate": {
        "image_field": "images",
        "ratios": {"1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"},
        "resolution": {"1K", "2K", "4K"},
    },
    "veo31_generate": {
        "image_field": "image_urls",
        "ratios": {"9:16", "16:9"},
        "durations": {"4", "6", "8"},
        "resolutions": {"720p", "1080p", "4k"},
    },
    "veo31Fast_generate": {
        "image_field": "image_urls",
        "ratios": {"9:16", "16:9"},
        "durations": {"4", "6", "8"},
        "resolutions": {"720p", "1080p", "4k"},
    },
}


def _snap_ratio(ratio: str, allowed: set[str]) -> str:
    """Nearest allowed aspect ratio. Veo only offers 9:16 and 16:9, so a 1:1
    brief has to land somewhere — and it must land DELIBERATELY rather than as
    a provider error the user reads as an outage."""
    if ratio in allowed:
        return ratio
    try:
        w, h = (float(x) for x in ratio.split(":"))
        want = w / h
    except (ValueError, ZeroDivisionError):
        return "9:16" if "9:16" in allowed else sorted(allowed)[0]
    best, gap = None, float("inf")
    for cand in allowed:
        if cand == "auto":
            continue
        cw, ch = (float(x) for x in cand.split(":"))
        d = abs(cw / ch - want)
        if d < gap:
            best, gap = cand, d
    return best or sorted(allowed)[0]


def _snap_duration(seconds: float, allowed: set[str]) -> str:
    """Nearest allowed duration, as the STRING the enum declares."""
    return min(allowed, key=lambda d: abs(int(d) - seconds))


def generate(
    kind: str,
    prompt: str,
    *,
    ratio: str = "9:16",
    duration_s: float = 4.0,
    tier: str = "final",
    image_urls: Optional[list[str]] = None,
    resolution: Optional[str] = None,
) -> dict[str, Any]:
    """One image or video via PixelBin. Returns {url, model, params}.

    Only parameters the target model actually declares are sent, and ratio and
    duration are snapped into that model's enum rather than passed through — a
    9:16 brief against a 16:9-only model should degrade visibly, not 400.

    `image_urls` is sent under whichever field name THIS model declares —
    `images` for the nanoBanana family, `image_urls` for veo31. That difference
    is not cosmetic; sending the wrong one is a 400 that reads like an outage.
    Every URL given is sent: the slot budget is applied once, upstream in
    `media.generate()`, against the same `config.MEDIA_REF_SLOTS` the board's
    B3 lint reads. Do NOT add a second cap here — one number, one place, or the
    lint and the client drift apart again.

    Audio is deliberately absent: PixelBin's catalogue has no TTS operation, so
    routing audio here would fail at the provider with a confusing message.
    `media.py` sends audio straight to fal and says so.
    """
    if kind == "image":
        model = config.PIXELBIN_MODELS[config.media_key("image", tier)]
        timeout = 300.0
    elif kind == "video":
        model = config.PIXELBIN_MODELS["video"]
        timeout = 900.0
    else:
        raise PixelbinError(f"PixelBin has no {kind} operation — fal handles that kind")

    caps = _CAPS.get(model)
    if caps is None:
        raise PixelbinError(
            f"{model} is not in the capability table — its parameter set is unknown, and "
            "guessing one is how a silent 400 becomes a fake outage. Read its schema and add it."
        )

    payload: dict[str, Any] = {"prompt": prompt, "aspect_ratio": _snap_ratio(ratio, caps["ratios"])}
    if kind == "video":
        payload["duration"] = _snap_duration(duration_s, caps["durations"])
        payload["resolution"] = "720p"
    elif caps.get("resolution"):
        # An unsupported value must not travel: output_resolution is a hard enum
        # and a stray "1K" against a model that only knows 2K/4K is a 400 the
        # user reads as an outage. Unset means "let the model decide".
        want = resolution or config.IMAGE_RESOLUTION_DEFAULT
        payload["output_resolution"] = want if want in caps["resolution"] else "2K"
    refs = [u for u in (image_urls or []) if u]
    if refs:
        # `_as_form` repeats a list under the same field name — a JSON-encoded
        # array is silently ignored, so the list shape has to survive this far.
        payload[caps["image_field"]] = refs

    urls = submit_and_wait(model, payload, timeout_s=timeout)
    safe_params = {k:v for k,v in payload.items() if k in ("aspect_ratio","output_resolution","resolution","duration")}
    logger.info("pixelbin %s via %s, reference_count=%d", kind, model, len(refs))
    return {"url": urls[0], "model": f"pixelbin:{model}", "params": safe_params}
