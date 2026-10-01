"""Immutable private files. Actor authorization remains mandatory at the store boundary."""
from __future__ import annotations
import hashlib
import os
import re
import uuid
from pathlib import Path
from typing import Any

MAX_BYTES = 64 * 1024 * 1024

class StorageError(RuntimeError):
    pass

def _owner(value: str) -> str:
    try:
        if str(uuid.UUID(value)) != value: raise ValueError()
    except (ValueError, TypeError, AttributeError):
        raise StorageError('invalid_owner') from None
    return value

def _authorize(owner_id: str) -> None:
    from app import config
    _owner(owner_id)
    if config.HOSTED:
        from app.execution import require_execution
        if require_execution().owner_id != owner_id: raise StorageError('foreign_owner')

def _bucket() -> str | None:
    from app import config
    mode = os.getenv('PLOTLINE_STORAGE_MODE', 's3')
    if mode == 'fixture':
        from app.execution import local_preview
        if config.HOSTED and not local_preview(): raise StorageError('fixture_storage_forbidden')
        return None
    bucket = os.getenv('PLOTLINE_STORAGE_BUCKET', '')
    if not re.fullmatch(r'[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]', bucket): raise StorageError('storage_unavailable')
    return bucket

def _client():
    import boto3
    from botocore.config import Config
    return boto3.client('s3', region_name=os.getenv('AWS_REGION', 'ap-south-1'),
        config=Config(retries={'total_max_attempts': 1},connect_timeout=5,read_timeout=30))

def _ref(owner_id: str, ref: dict) -> None:
    _authorize(owner_id)
    if not isinstance(ref,dict) or ref.get('owner_id') != owner_id: raise StorageError('foreign_owner')
    key=ref.get('key','')
    if not re.fullmatch(r'private/users/'+re.escape(owner_id)+r'/files/[A-Za-z0-9_-]{1,80}/[a-f0-9]{64}', key): raise StorageError('invalid_key')
    if not re.fullmatch(r'[a-f0-9]{64}',ref.get('sha256','')) or key.rsplit('/',1)[-1]!=ref['sha256']:raise StorageError('invalid_hash')
    if not isinstance(ref.get('version_id'),str) or not ref['version_id'] or ref['version_id']=='null':raise StorageError('missing_version')
    if type(ref.get('bytes')) is not int or not 0 < ref['bytes'] <= MAX_BYTES:raise StorageError('invalid_size')

def _read(client,bucket,ref) -> bytes:
    obj=client.get_object(Bucket=bucket,Key=ref['key'],VersionId=ref['version_id'])
    stream=obj['Body']
    try:
        if obj.get('ContentLength') != ref['bytes']:raise StorageError('size_mismatch')
        data=stream.read(ref['bytes']+1)
    finally: stream.close()
    if len(data)!=ref['bytes'] or hashlib.sha256(data).hexdigest()!=ref['sha256']:raise StorageError('hash_mismatch')
    return data

def persist_asset(owner_id: str, asset_id: str, path: Path | str, content_type: str, *, kind: str='asset') -> dict[str,Any] | None:
    _authorize(owner_id)
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,80}',asset_id):raise StorageError('invalid_asset_id')
    source=Path(path)
    if source.is_symlink() or not source.is_file() or not 0 < source.stat().st_size <= MAX_BYTES:raise StorageError('invalid_file')
    fd=os.open(source,os.O_RDONLY | getattr(os,"O_NOFOLLOW",0))
    with os.fdopen(fd,"rb") as f:data=f.read(MAX_BYTES+1)
    if not 0 < len(data) <= MAX_BYTES:raise StorageError('invalid_size')
    bucket=_bucket()
    if bucket is None:return None
    digest=hashlib.sha256(data).hexdigest();key=f'private/users/{owner_id}/files/{asset_id}/{digest}'
    client=_client()
    try:
        obj=client.put_object(Bucket=bucket,Key=key,Body=data,ContentType=content_type,
             ServerSideEncryption='AES256',Metadata={'sha256':digest})
        ref={'owner_id':owner_id,'key':key,'version_id':obj.get('VersionId'),'sha256':digest,'bytes':len(data),'content_type':content_type}
        _ref(owner_id,ref)
        _read(client,bucket,ref)
        return ref
    except StorageError:raise
    except Exception:raise StorageError('storage_write_failed') from None

def hydrate_asset(owner_id: str, ref: dict, destination: Path | str) -> Path:
    _ref(owner_id,ref);bucket=_bucket()
    if not bucket:raise StorageError('fixture_hydration_unavailable')
    target=Path(destination)
    if target.is_symlink() or any(p.is_symlink() for p in target.parents):raise StorageError('invalid_destination')
    try:data=_read(_client(),bucket,ref)
    except StorageError:raise
    except Exception:raise StorageError('storage_read_failed') from None
    target.parent.mkdir(parents=True,exist_ok=True)
    temp=target.with_name(target.name+'.'+uuid.uuid4().hex+'.tmp')
    try:
        fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
        os.replace(temp,target)
    finally:
        if temp.exists():temp.unlink()
    return target

def signed_reference(owner_id: str, ref: dict, expires: int=300) -> str:
    from app.execution import require_live_tools
    require_live_tools();_ref(owner_id,ref)
    if type(expires) is not int or not 1 <= expires <= 300:raise StorageError('invalid_expiry')
    bucket=_bucket()
    if not bucket:raise StorageError('fixture_signing_forbidden')
    return _client().generate_presigned_url('get_object',Params={'Bucket':bucket,'Key':ref['key'],'VersionId':ref['version_id']},ExpiresIn=expires)

def validate_provider_reference(url: str) -> None:
    """Only short-lived S3 references in the current actor's private prefix."""
    from urllib.parse import urlsplit, parse_qs, unquote
    from app.execution import require_live_tools, require_execution
    require_live_tools();owner=require_execution().owner_id
    bucket=_bucket();region=os.getenv('AWS_REGION','ap-south-1')
    p=urlsplit(url);q=parse_qs(p.query)
    if not bucket or p.scheme!='https' or p.hostname not in (f'{bucket}.s3.{region}.amazonaws.com',f'{bucket}.s3.amazonaws.com') or p.port not in (None,443) or p.username or p.password or p.fragment:raise StorageError('invalid_provider_reference')
    key=unquote(p.path.lstrip('/'))
    if not re.fullmatch(r'private/users/'+re.escape(owner)+r'/files/[A-Za-z0-9_-]{1,80}/[a-f0-9]{64}',key):raise StorageError('foreign_owner')
    if not q.get('versionId') or not q.get('X-Amz-Signature') or not q.get('X-Amz-Expires') or len(q['X-Amz-Expires'])!=1:raise StorageError('unsigned_reference')
    try:expiry=int(q['X-Amz-Expires'][0])
    except ValueError:raise StorageError('invalid_expiry') from None
    if not 1<=expiry<=300:raise StorageError('invalid_expiry')
