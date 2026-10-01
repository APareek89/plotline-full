"""Real OpenAI SDK serialization over denied/mock transport; zero paid calls."""
import json
from decimal import Decimal
from types import SimpleNamespace
import httpx
import pytest
from app import config,usage
from app.agents import providers as p
from app.execution import Execution,execution_scope

@pytest.fixture
def meter(monkeypatch):
    rows=[]
    monkeypatch.setenv('OPENAI_API_KEY','fixture-not-a-real-key')
    for name in ('reserve','dispatch','settle','uncertain','release'):
        def record(*args,_name=name,**kwargs):
            rows.append((_name,kwargs));return SimpleNamespace(id='fixture') if _name=='reserve' else None
        monkeypatch.setattr(usage,name,record)
    monkeypatch.setattr(config,'MOCK_LLM',False)
    monkeypatch.setattr(config,'LLM_PROVIDER','openai')
    return rows

def response(output=None,**updates):
    value={'id':'resp_fixture','object':'response','created_at':1,'model':'gpt-5.4-mini','status':'completed',
      'output':output if output is not None else [{'type':'message','id':'msg_fixture','role':'assistant','status':'completed','content':[{'type':'output_text','text':'{"ok":true}','annotations':[]}]}],
      'usage':{'input_tokens':100,'output_tokens':10,'input_tokens_details':{'cached_tokens':20},'output_tokens_details':{'reasoning_tokens':0}}}
    value.update(updates);return value

def invoke():return p.openai_call('gpt-5.4-mini','Return JSON',[{'role':'user','content':[{'type':'text','text':'test'}]}],None,False,False,[])

def wire(monkeypatch,handler):monkeypatch.setattr(p,'_http',lambda:httpx.Client(transport=httpx.MockTransport(handler)))

def test_real_sdk_body_and_settlement(meter,monkeypatch):
    seen=[]
    def handle(req):seen.append(json.loads(req.content));return httpx.Response(200,json=response())
    wire(monkeypatch,handle)
    assert invoke()=='{"ok":true}'
    assert len(seen)==1 and seen[0]['store'] is False and seen[0]['reasoning']=={'effort':'none'}
    assert seen[0]['max_output_tokens']==config.MAX_OUTPUT_TOKENS
    assert [x[0] for x in meter]==['reserve','dispatch','settle']
    assert meter[-1][1]['actual_usd']==Decimal('0.0001065')

def test_http500_and_transport_do_not_retry_or_release(meter,monkeypatch):
    for failure in ('http','wire'):
        seen=[];meter.clear()
        def handler(req):
            seen.append(1)
            if failure=='wire':raise httpx.ReadError('fixture dropped',request=req)
            return httpx.Response(500,json={'error':{'message':'fixture','type':'server_error'}})
        wire(monkeypatch,handler)
        with pytest.raises(p.ProviderFailure,match='unknown'):invoke()
        assert len(seen)==1 and [x[0] for x in meter]==['reserve','dispatch','uncertain']

def test_rejection_zero_settlement_and_no_retry(meter,monkeypatch):
    seen=[]
    def handler(req):seen.append(1);return httpx.Response(401,json={'error':{'message':'fixture','type':'auth_error'}})
    wire(monkeypatch,handler)
    with pytest.raises(p.ProviderFailure,match='rejected'):invoke()
    assert len(seen)==1 and meter[-1]==('settle',{'actual_usd':Decimal(0)})

def test_usage_settled_before_incomplete_output(meter,monkeypatch):
    wire(monkeypatch,lambda req:httpx.Response(200,json=response(status='incomplete',incomplete_details={'reason':'max_output_tokens'})))
    with pytest.raises(p.ProviderTruncated):invoke()
    assert meter[-1][0]=='settle'

def test_bound_blocks_before_dispatch(meter,monkeypatch):
    wire(monkeypatch,lambda req:pytest.fail('no dispatch allowed'))
    monkeypatch.setattr(config,'MAX_INPUT_BYTES',1)
    with pytest.raises(p.ProviderFailure,match='input_limit'):invoke()
    assert meter==[]

def test_cached_scope_blocks_live_sdk(meter,monkeypatch):
    wire(monkeypatch,lambda req:pytest.fail('no dispatch allowed'))
    with execution_scope(Execution('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000012',mode='cached')):
        with pytest.raises(PermissionError):invoke()
    assert meter==[]

@pytest.mark.parametrize("async_fields", [{}, {"async": False}])
def test_function_roundtrip_uses_same_graph_tools(meter,monkeypatch,async_fields):
    seen=[]
    def handler(req):
        body=json.loads(req.content);seen.append(body)
        if len(seen)==2:
            tool=body['input'][-2]
            if 'async_' in tool or any(v is None for v in tool.values()):
                return httpx.Response(400,json={'error':{'type':'invalid_request_error','code':'unknown_parameter','param':'input[1].async_','message':'untrusted provider details must not persist'}})
            assert tool=={'type':'function_call','id':'fc_fixture','call_id':'call_fixture','name':'get_profile','arguments':'{}','status':'completed',**async_fields}
        return httpx.Response(200,json=response(output=[{'type':'function_call','id':'fc_fixture','call_id':'call_fixture','name':'get_profile','arguments':'{}','status':'completed',**async_fields}]) if len(seen)==1 else response())
    wire(monkeypatch,handler)
    dispatcher=SimpleNamespace(dispatch=lambda name,args:'{"niche":"fixture"}')
    assert p.openai_call('gpt-5.4-mini','JSON',[{'role':'user','content':'test'}],dispatcher,True,False,[])=='{"ok":true}'
    assert len(seen)==2 and seen[1]['input'][-1]=={'type':'function_call_output','call_id':'call_fixture','output':'{"niche":"fixture"}'}
    assert [x[0] for x in meter].count('settle')==2

def test_actual_searches_recorded_and_priced(meter,monkeypatch):
    monkeypatch.setattr(config,'WEB_SEARCH',True);seen=[];searched=[]
    def handler(req):
        seen.append(json.loads(req.content))
        return httpx.Response(200,json=response(output=[{'type':'web_search_call','id':'ws_fixture','status':'completed','action':{'type':'search','query':'fixture query'}}]+response()['output']))
    wire(monkeypatch,handler)
    p.openai_call('gpt-5.4-mini','JSON',[{'role':'user','content':'test'}],None,False,True,searched)
    assert searched==['fixture query'] and seen[0]['max_tool_calls']==config.WEB_SEARCH_MAX_USES
    assert meter[-1][1]['actual_usd']==Decimal('.0101065')
def test_explicit_anthropic_real_sdk_stream_is_metered(meter,monkeypatch):
    import httpx2
    monkeypatch.setenv('ANTHROPIC_API_KEY','fixture-not-a-real-key');seen=[]
    events=[('message_start',{'type':'message_start','message':{'id':'msg_fixture','type':'message','role':'assistant','model':'claude-haiku-4-5','content':[],'stop_reason':None,'stop_sequence':None,'usage':{'input_tokens':10,'output_tokens':0}}}),
      ('content_block_start',{'type':'content_block_start','index':0,'content_block':{'type':'text','text':''}}),
      ('content_block_delta',{'type':'content_block_delta','index':0,'delta':{'type':'text_delta','text':'{"ok":true}'}}),
      ('content_block_stop',{'type':'content_block_stop','index':0}),
      ('message_delta',{'type':'message_delta','delta':{'stop_reason':'end_turn','stop_sequence':None},'usage':{'output_tokens':5}}),
      ('message_stop',{'type':'message_stop'})]
    def handle(req):
        seen.append(json.loads(req.content));return httpx2.Response(200,headers={'content-type':'text/event-stream'},content=''.join('event: '+name+'\ndata: '+json.dumps(data)+'\n\n' for name,data in events).encode())
    monkeypatch.setattr(p,"_anthropic_http",lambda:httpx2.Client(transport=httpx2.MockTransport(handle)))
    assert p.anthropic_call('claude-haiku-4-5','JSON',[{'role':'user','content':'test'}],None,False,False,[])=='{"ok":true}'
    assert len(seen)==1 and seen[0]['stream'] is True and meter[-1][0]=='settle'
    assert meter[-1][1]['actual_usd']==Decimal('.000035')
def test_actual_sdk_large_image_separate_from_text_bound(meter,monkeypatch):
    import base64
    image=base64.b64encode(b'fixture-image-bytes'*12000).decode();seen=[]
    assert len(image)>128000
    def handle(req):seen.append(json.loads(req.content));return httpx.Response(200,json=response())
    wire(monkeypatch,handle)
    p.openai_call('gpt-5.4-mini','JSON',[{'role':'user','content':[{'type':'image','source':{'type':'base64','media_type':'image/png','data':image}},{'type':'text','text':'describe fixture'}]}],None,False,False,[])
    assert len(seen)==1 and seen[0]['input'][0]['content'][0]['image_url']=='data:image/png;base64,'+image
    assert meter[0][1]['metadata']['input_token_cap']==400000
    meter.clear()
    with pytest.raises(p.ProviderFailure,match='image_limit'):
        p.openai_call('gpt-5.4-mini','JSON',[{'role':'user','content':[{'type':'image','source':{'type':'base64','media_type':'image/png','data':'A'*(20*1024*1024+4)}}]}],None,False,False,[])
    assert meter==[] and len(seen)==1
def test_policy_refusal_settles_usage_and_stops(meter,monkeypatch):
    wire(monkeypatch,lambda req:httpx.Response(200,json=response(output=[{'type':'message','id':'msg_fixture','role':'assistant','status':'completed','content':[{'type':'refusal','refusal':'fixture refusal'}]}])))
    with pytest.raises(p.ProviderFailure,match='policy_refusal'):invoke()
    assert [x[0] for x in meter]==['reserve','dispatch','settle']


def test_slow_trickle_transport_hits_wall_deadline_once_and_keeps_uncertain(meter,monkeypatch):
    clock=[0.0];seen=[]
    monkeypatch.setattr(p.time,'monotonic',lambda:clock[0])
    class Slow(httpx.SyncByteStream):
        def __iter__(self):
            yield b'{'
            clock[0]=config.MAX_AGENT_SECONDS+1
            yield b'"id"'
    def handle(req):
        seen.append(req)
        return httpx.Response(200,headers={'content-type':'application/json'},stream=Slow())
    monkeypatch.setattr(httpx,'HTTPTransport',lambda **kwargs:httpx.MockTransport(handle))
    with pytest.raises(p.ProviderFailure,match='unknown'):invoke()
    assert len(seen)==1 and [x[0] for x in meter]==['reserve','dispatch','uncertain']


def test_http_rejection_persists_only_safe_protocol_metadata(meter,monkeypatch):
    from pydantic import BaseModel
    from app.agents import runner
    class Result(BaseModel):
        ok: bool
    seen=[]
    def handler(req):
        seen.append(req)
        return httpx.Response(400,json={'error':{
            'message':'SECRET_SENTINEL https://private.invalid/?token=SECRET_SENTINEL',
            'code':'unknown_parameter','param':'input[1].async_',
            'type':'invalid_request_error'}})
    wire(monkeypatch,handler)
    with pytest.raises(runner.AgentTransport,match=r'status=400 code=unknown_parameter param=input\[1\].async_'):
        runner.run_agent(agent='diagnostic_fixture',prompt_name='campaign_intake',
                         model='gpt-5.4-mini',user_payload={'fixture':True},schema=Result)
    rows=[json.loads(line) for line in (config.LOG_DIR/'agent_runs.jsonl').read_text().splitlines()]
    saved=next(row for row in rows if row['agent']=='diagnostic_fixture')
    assert saved['attempts']==1 and len(seen)==1
    assert saved['validation_errors']==['provider_request_rejected status=400 code=unknown_parameter param=input[1].async_']
    assert 'SECRET_SENTINEL' not in json.dumps(saved)
    assert meter[-1]==('settle',{'actual_usd':Decimal(0)})
    reason=p._rejection_reason(400,SimpleNamespace(body={'error':{
        'code':'SECRET_SENTINEL','param':'input[0].SECRET_SENTINEL','message':'SECRET_SENTINEL'}}))
    assert reason=='provider_request_rejected status=400'
