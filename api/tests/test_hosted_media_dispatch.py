from types import SimpleNamespace
import httpx,pytest
from app import config,media,media_transport as t,pixelbin_client as pb,usage
@pytest.fixture
def meter(monkeypatch):
 rows=[]
 for name in ('reserve','dispatch','settle','uncertain','release'):
  def record(*args,_name=name,**kwargs):rows.append((_name,kwargs));return SimpleNamespace(id='fixture') if _name=='reserve' else None
  monkeypatch.setattr(usage,name,record)
 monkeypatch.setattr(config,'PIXELBIN_API_TOKEN','fixture-only');monkeypatch.setattr(config,'FAL_KEY','fixture-only');return rows
def reply(code,body):return httpx.Response(code,json=body,request=httpx.Request('GET','https://api.pixelbin.io/fixture'))
def test_accepted_poll_failure_never_resubmits(meter,monkeypatch):
 calls=[]
 def request(method,url,**kw):
  calls.append((method,url))
  if method=='POST':return reply(200,{'_id':'job_fixture'})
  raise httpx.ReadError('fixture failure')
 monkeypatch.setattr(t,'request',request)
 with pytest.raises(pb.PixelbinError):
  with t.attempt('pixelbin','nanoBanana2_generate',.08):pb.submit_and_wait('nanoBanana2_generate',{'prompt':'fixture'})
 assert [x[0] for x in calls]==['POST','GET'] and meter[-1][0]=='uncertain' and meter[-1][1]['provider_job_id']=='job_fixture'
def test_terminal_policy_no_fallback(meter,monkeypatch):
 monkeypatch.setattr(t,'request',lambda *a,**kw:reply(422,{'error':{'code':'CONTENT_POLICY_VIOLATION'}}))
 with pytest.raises(pb.PixelbinError) as failure:
  with t.attempt('pixelbin','nanoBanana2_generate',.08):pb.submit_and_wait('nanoBanana2_generate',{'prompt':'fixture'})
 assert failure.value.policy and not failure.value.safe_to_fallback and meter[-1][1]['actual_usd'] is None

def test_rejection_logs_only_bounded_protocol_diagnostics(meter,monkeypatch,caplog):
 calls=[]
 def request(method,url,**kwargs):
  calls.append(method)
  return reply(400,{'errorCode':'JR-1000','message':'secret-url?X-Amz-Signature=private',
   'errors':[{'keyword':'format','instancePath':'/input/images/0','message':'private-value'},
             {'code':'secret-code','param':'https://secret.example/private'}]})
 monkeypatch.setattr(t,'request',request)
 with caplog.at_level('WARNING'),pytest.raises(pb.PixelbinError):
  with t.attempt('pixelbin','nanoBanana_generate',0):pb.submit_and_wait('nanoBanana_generate',{'prompt':'private-prompt'})
 assert calls==['POST'] and meter[-1][0]=='settle' and meter[-1][1]['actual_usd'] is None
 assert 'status=400 code=JR-1000,format param=/input/images/0' in caplog.text
 assert all(secret not in caplog.text for secret in ('secret-url','private','secret-code','secret.example'))

def test_pixelbin_reference_wire_matches_published_sdk(meter,monkeypatch):
 import json
 requests=[];original=httpx.Client
 def handler(request):
  requests.append(request)
  body=({'_id':'fixture_job'} if request.method=='POST' else
        {'status':'SUCCESS','output':['https://cdn.example/output.png'],'consumedCredits':1})
  return httpx.Response(200,stream=httpx.ByteStream(json.dumps(body).encode()))
 monkeypatch.setattr(httpx,'Client',lambda **kwargs:original(transport=httpx.MockTransport(handler),**kwargs))
 monkeypatch.setitem(config.PIXELBIN_MODELS,'image_final','nanoBanana_generate')
 refs=['https://owned.example/a?signature=fixture','https://owned.example/b?signature=fixture']
 with t.attempt('pixelbin','nanoBanana_generate',0):
  pb.generate('image','preserve the referenced product',ratio='1:1',image_urls=refs)
 body=requests[0].content.decode()
 assert [r.method for r in requests]==['POST','GET']
 assert body.count('name="input.images"')==2 and all(ref in body for ref in refs)
 assert 'name="input.prompt"' in body and 'name="input.aspect_ratio"' in body
 assert 'input.images[]' not in body and 'output_resolution' not in body
 assert meter[-1][0]=='settle' and meter[-1][1]['consumed_credits']==1
def test_fal_credentials_ignore_returned_urls(meter,monkeypatch):
 calls=[]
 def request(method,url,**kw):
  calls.append(url)
  if method=='POST':return reply(200,{'request_id':'job_fixture','status_url':'https://evil.example/','response_url':'http://169.254.169.254/'})
  return reply(200,{'status':'COMPLETED'} if url.endswith('/status') else {'images':[{'url':'https://cdn.example/fixture.png'}]})
 monkeypatch.setattr(t,'request',request)
 with t.attempt('fal','fal-ai/nano-banana',.08):media._submit_and_wait('fal-ai/nano-banana',{'prompt':'fixture'})
 assert all(x.startswith('https://queue.fal.run/fal-ai/nano-banana') for x in calls) and meter[-1][0]=='settle'
def test_mock_svg_escaped(tmp_path):
 path=tmp_path/'fixture.svg';media._mock_image('<script>alert(1)</script>','1:1',path)
 assert '<script>' not in path.read_text() and '&lt;script&gt;' in path.read_text()
def test_5xx_remains_uncertain(meter,monkeypatch):
 monkeypatch.setattr(t,'request',lambda *a,**kw:reply(503,{'error':'fixture'}))
 with pytest.raises(pb.PixelbinError) as failure:
  with t.attempt('pixelbin','nanoBanana2_generate',.08):pb.submit_and_wait('nanoBanana2_generate',{'prompt':'fixture'})
 assert not failure.value.safe_to_fallback and meter[-1][0]=='uncertain'
def test_malformed_job_id_never_forms_authenticated_poll(meter,monkeypatch):
 calls=[]
 def request(method,url,**kwargs):calls.append((method,url));return reply(200,{'_id':'../admin?secret'})
 monkeypatch.setattr(t,'request',request)
 with pytest.raises(pb.PixelbinError):
  with t.attempt('pixelbin','nanoBanana_generate',0):pb.submit_and_wait('nanoBanana_generate',{'prompt':'fixture'})
 assert len(calls)==1 and calls[0][0]=='POST' and meter[-1][0]=='uncertain'
def test_pixelbin_params_and_logs_do_not_retain_signed_references(monkeypatch,caplog):
 reference='https://bucket.example/ref?X-Amz-Signature=private-fixture'
 monkeypatch.setattr(pb,'submit_and_wait',lambda *a,**kw:['https://output.example/image'])
 with caplog.at_level('INFO'):
  out=pb.generate('image','fixture',ratio='1:1',duration_s=4,tier='final',image_urls=[reference],resolution='1K')
 assert reference not in caplog.text and 'private-fixture' not in str(out['params'])


def test_provider_compression_rejected_before_decode_retains_uncertain(meter,monkeypatch):
 original=httpx.Client;seen=[]
 class NeverDecode(httpx.SyncByteStream):
  def __iter__(self):pytest.fail('compressed provider body must not be iterated')
 def handle(req):
  seen.append(req)
  return httpx.Response(200,headers={'content-encoding':'gzip'},stream=NeverDecode())
 monkeypatch.setattr(httpx,'Client',lambda **kwargs:original(transport=httpx.MockTransport(handle),**kwargs))
 with pytest.raises(ValueError,match='provider_response_encoding'):
  with t.attempt('pixelbin','nanoBanana_generate',0):
   t.before_submit({'prompt':'fixture'})
   t.request('POST','https://api.pixelbin.io/fixture',headers={'Authorization':'fixture','accept-encoding':'gzip'},json_body={'prompt':'fixture'})
 assert len(seen)==1 and seen[0].headers['accept-encoding']=='identity'
 assert meter[-1][0]=='uncertain'


def test_planned_model_uses_actual_primary_mapping(monkeypatch):
 monkeypatch.setattr(config,'MEDIA_PROVIDER','pixelbin')
 assert media.planned_model('image')=='pixelbin:'+config.PIXELBIN_MODELS['image_final']
 monkeypatch.setattr(config,'MEDIA_PROVIDER','fal')
 assert media.planned_model('image')=='fal:'+config.MEDIA_MODELS['image_final']
