"""One media submission per metered attempt; accepted/unknown work never fails over."""
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
import hashlib
import json
import re
import time
import httpx
from app import usage
from app.execution import require_live_tools

@dataclass
class Attempt:
    reservation: object
    maximum: float
    dispatched: bool=False
    done: bool=False
    job_id: str | None=None
    consumed_credits: str | None=None
_active=ContextVar('media_attempt',default=None)

@contextmanager
def attempt(provider,model,maximum):
    require_live_tools()
    record=Attempt(usage.reserve(kind='media',provider=provider,model=model,maximum_usd=0,
                                metadata={'stage':'unknown_usd_operation_cap'}),maximum)
    token=_active.set(record)
    try:yield record
    finally:
        try:
            if not record.done:
                if record.dispatched:usage.uncertain(record.reservation,provider_job_id=record.job_id,reason='media_unknown')
                else:usage.release(record.reservation)
        finally:_active.reset(token)

def before_submit(payload):
    record=_active.get()
    if record is None:raise RuntimeError('media_attempt_required')
    raw=json.dumps(payload,sort_keys=True,separators=(',',':')).encode()
    if len(raw)>128000:raise ValueError('media_request_too_large')
    try:usage.dispatch(record.reservation,request_sha256=hashlib.sha256(raw).hexdigest())
    except Exception:
        # The ledger releases a provably unstarted expired-session reservation itself.
        record.done=True
        raise
    record.dispatched=True

def accepted(job_id):
    if not isinstance(job_id,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,100}',job_id):raise ValueError('invalid_provider_job_id')
    record=_active.get()
    if record:record.job_id=job_id

def completed(consumed_credits=None):
    from decimal import Decimal, InvalidOperation
    record=_active.get()
    credits=None
    if consumed_credits is not None:
        try:
            credits=Decimal(str(consumed_credits))
            if not credits.is_finite() or credits<0 or credits>100000:credits=None
        except (InvalidOperation,ValueError,TypeError):credits=None
    if record:
        usage.settle(record.reservation,actual_usd=None,provider_job_id=record.job_id,consumed_credits=credits)
        record.consumed_credits=str(credits) if credits is not None else None
        record.done=True

def rejected():
    record=_active.get()
    if record:
        usage.settle(record.reservation,actual_usd=None,provider_job_id=record.job_id,consumed_credits=None);record.done=True

def request(method,url,*,headers,timeout=30,json_body=None,files=None):
    """Fixed provider URLs only; no proxy, redirect, retry or unbounded JSON."""
    from urllib.parse import urlsplit
    p=urlsplit(url)
    if p.scheme!='https' or p.hostname not in ('api.pixelbin.io','queue.fal.run') or p.port not in (None,443) or p.username or p.password or p.fragment:raise ValueError('provider_origin_denied')
    started=time.monotonic();body=bytearray()
    with httpx.Client(timeout=min(timeout,60),follow_redirects=False,trust_env=False) as client:
        with client.stream(method,url,headers={**{k:v for k,v in headers.items() if k.lower()!="accept-encoding"},"Accept-Encoding":"identity"},json=json_body,files=files) as response:
            if response.headers.get("content-encoding", "identity").lower().strip() not in ("", "identity"):
                raise ValueError("provider_response_encoding")
            for part in response.iter_raw(chunk_size=65536):
                body.extend(part)
                if len(body)>2*1024*1024 or time.monotonic()-started>timeout:raise ValueError('provider_response_limit')
            # Iterated bytes have already been decoded; stale encoding/length are omitted.
            return httpx.Response(response.status_code,content=bytes(body),request=httpx.Request(method,url),headers={'content-type':response.headers.get('content-type','application/json')})

def is_policy(response):
    try:
        data=response.json()
        values=[]
        def walk(v,depth=0):
            if depth>4:return
            if isinstance(v,dict):
                for key,value in v.items():
                    if key.lower() in ('code','type','reason','error_code') and isinstance(value,str):values.append(value.lower())
                    elif isinstance(value,(dict,list)):walk(value,depth+1)
            elif isinstance(v,list):
                for x in v[:20]:walk(x,depth+1)
        walk(data)
        return any(any(w in x for w in ('safety','policy','moderation','content_filter','nsfw')) for x in values)
    except Exception:return False
