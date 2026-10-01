import hashlib,io,uuid
import pytest
from app import config,media_storage as s
from app.execution import Execution,execution_scope
A='00000000-0000-4000-8000-000000000011';B='00000000-0000-4000-8000-000000000012';SID='00000000-0000-4000-8000-000000000013'
class FakeS3:
 def __init__(self):self.objects={};self.calls=[]
 def put_object(self,**kw):
  self.calls.append(('put',kw));v=uuid.uuid4().hex;self.objects[(kw['Key'],v)]=kw['Body'];return {'VersionId':v}
 def get_object(self,**kw):
  self.calls.append(('get',kw));data=self.objects[(kw['Key'],kw['VersionId'])];return {'ContentLength':len(data),'Body':io.BytesIO(data)}
 def generate_presigned_url(self,*a,**kw):self.calls.append(('sign',kw));return 'fixture-signed'
@pytest.fixture
def backend(monkeypatch):
 f=FakeS3();monkeypatch.setattr(config,'HOSTED',True);monkeypatch.setenv('PLOTLINE_STORAGE_MODE','s3');monkeypatch.setenv('PLOTLINE_STORAGE_BUCKET','portfolio-plotline-fixture');monkeypatch.setattr(s,'_client',lambda:f);return f
def source(tmp_path):p=tmp_path/'source';p.write_bytes(b'owned fixture');return p
def test_version_hash_and_cold_hydrate(backend,tmp_path):
 p=source(tmp_path)
 with execution_scope(Execution(A,SID)):
  ref=s.persist_asset(A,'ast_example',p,'text/plain');copy=s.hydrate_asset(A,ref,tmp_path/'new'/'copy')
 assert copy.read_bytes()==p.read_bytes() and ref['sha256']==hashlib.sha256(p.read_bytes()).hexdigest()
 assert all(c[1].get('VersionId')==ref['version_id'] for c in backend.calls if c[0]=='get')
 assert backend.calls[0][1]['ServerSideEncryption']=='AES256'
def test_foreign_owner_denied_before_s3(backend,tmp_path):
 with execution_scope(Execution(A,SID)):ref=s.persist_asset(A,'up_fixture',source(tmp_path),'text/plain')
 n=len(backend.calls)
 with execution_scope(Execution(B,SID)):
  with pytest.raises(s.StorageError):s.hydrate_asset(B,ref,tmp_path/'copy')
  with pytest.raises(s.StorageError):s.signed_reference(B,ref)
 assert len(backend.calls)==n
def test_tampered_version_readback_rejected(backend,tmp_path):
 with execution_scope(Execution(A,SID)):
  ref=s.persist_asset(A,'ast_fixture',source(tmp_path),'text/plain');backend.objects[(ref['key'],ref['version_id'])]=b'tampered'
  with pytest.raises(s.StorageError,match='mismatch'):s.hydrate_asset(A,ref,tmp_path/'copy')
 assert not (tmp_path/'copy').exists()
def test_cached_signing_denied_and_ttl(backend,tmp_path):
 with execution_scope(Execution(A,SID)):ref=s.persist_asset(A,'ast_fixture',source(tmp_path),'text/plain')
 with execution_scope(Execution(A,SID,mode='cached')):
  with pytest.raises(PermissionError):s.signed_reference(A,ref)
 with execution_scope(Execution(A,SID)):
  with pytest.raises(s.StorageError):s.signed_reference(A,ref,301)
  assert s.signed_reference(A,ref)=='fixture-signed'
 assert backend.calls[-1][1]['Params']['VersionId']==ref['version_id']
def test_missing_bucket_and_symlink_failclosed(backend,tmp_path,monkeypatch):
 p=source(tmp_path);link=tmp_path/'link';link.symlink_to(p)
 with execution_scope(Execution(A,SID)):
  with pytest.raises(s.StorageError):s.persist_asset(A,'ast_fixture',link,'text/plain')
  monkeypatch.delenv('PLOTLINE_STORAGE_BUCKET')
  with pytest.raises(s.StorageError):s.persist_asset(A,'ast_fixture',p,'text/plain')
 assert backend.calls==[]
def test_reference_scope_requires_current_owner_version_signature_and_short_ttl(backend):
 digest='a'*64;base=f'https://portfolio-plotline-fixture.s3.ap-south-1.amazonaws.com/private/users/{A}/files/ast_fixture/{digest}'
 good=base+'?versionId=v1&X-Amz-Signature=fixture&X-Amz-Expires=300'
 with execution_scope(Execution(A,SID)):
  s.validate_provider_reference(good)
  for bad in (good.replace(A,B),good.replace('=300','=301'),base,good.replace('https:','http:'),good.replace('amazonaws.com','evil.example')):
   with pytest.raises(s.StorageError):s.validate_provider_reference(bad)
