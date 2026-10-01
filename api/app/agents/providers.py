"""Bounded, metered provider adapters. No implicit dispatch retry or failover."""
from __future__ import annotations
import hashlib
import base64
import binascii
import json
import time
from decimal import Decimal
from typing import Any
import httpx
from app import config
from app.tools import TOOL_DEFS

class ProviderFailure(RuntimeError): pass
class ProviderTruncated(ValueError): pass

RATES = {'gpt-5.4-mini':(Decimal('.75'),Decimal('4.5'),Decimal('.075'),400000),
         'gpt-5.4-mini-2026-03-17':(Decimal('.75'),Decimal('4.5'),Decimal('.075'),400000),
         'claude-sonnet-4-6':(Decimal('3'),Decimal('15'),Decimal('.3'),1000000),
         'claude-haiku-4-5':(Decimal('1'),Decimal('5'),Decimal('.1'),200000)}

def _json(v):return json.dumps(v,separators=(',',':'),ensure_ascii=False,default=lambda x:x.model_dump(mode='json'))

def _int(v):
    if type(v) is not int or v < 0:raise ProviderFailure('invalid_provider_usage')
    return v

def _make_http(lib):
    class CappedStream(lib.SyncByteStream):
        def __init__(self,inner,started):self.inner=inner;self.started=started
        def __iter__(self):
            n=0
            for chunk in self.inner:
                n+=len(chunk)
                if n>2*1024*1024:raise ProviderFailure('provider_response_too_large')
                if time.monotonic()-self.started>config.MAX_AGENT_SECONDS:raise ProviderFailure('provider_response_deadline')
                yield chunk
        def close(self):self.inner.close()
    class Transport(lib.BaseTransport):
        def __init__(self):self.inner=lib.HTTPTransport(retries=0)
        def handle_request(self,request):
            request.headers['Accept-Encoding']='identity'
            started=time.monotonic()
            response=self.inner.handle_request(request)
            if response.headers.get('Content-Encoding','identity').lower() not in ('identity',''):
                response.close();raise ProviderFailure('unexpected_provider_encoding')
            response.stream=CappedStream(response.stream,started)
            return response
        def close(self):self.inner.close()
    return lib.Client(transport=Transport(),timeout=lib.Timeout(60,connect=10),follow_redirects=False,trust_env=False)

def _http():return _make_http(httpx)
def _anthropic_http():
    import httpx2
    return _make_http(httpx2)


def _reserve(provider,model,body,searches):
    from app import usage
    from app.execution import require_live_tools
    require_live_tools()
    if model not in RATES:raise ProviderFailure('unpriced_model')
    raw=_json(body).encode()
    image_bytes=0;image_count=0
    def text_shape(value):
        nonlocal image_bytes,image_count
        if isinstance(value,dict):
            if value.get('type')=='input_image':
                image_count+=1;url=value.get('image_url','')
                if url.startswith('data:'):
                    encoded=url.partition(',')[2];image_bytes+=len(encoded)
                    if image_bytes>20*1024*1024:raise ProviderFailure('provider_image_limit')
                    try:base64.b64decode(encoded,validate=True)
                    except (ValueError,binascii.Error):raise ProviderFailure('invalid_image_encoding') from None
                return {'type':'input_image','image_url':'[bounded image]'}
            if value.get('type')=='image':
                image_count+=1;src=value.get('source',{})
                if src.get('type')=='base64':
                    encoded=src.get('data','');image_bytes+=len(encoded)
                    if image_bytes>20*1024*1024:raise ProviderFailure('provider_image_limit')
                    try:base64.b64decode(encoded,validate=True)
                    except (ValueError,binascii.Error):raise ProviderFailure('invalid_image_encoding') from None
                return {'type':'image','source':'[bounded image]'}
            return {k:text_shape(v) for k,v in value.items()}
        if isinstance(value,list):return [text_shape(v) for v in value]
        return value
    text_bytes=len(_json(text_shape(body)).encode())
    if image_count>4:raise ProviderFailure('provider_image_limit')
    if text_bytes>config.MAX_INPUT_BYTES:raise ProviderFailure('provider_input_limit')
    ri,ro,_,context=RATES[model]
    # UTF-8 bytes bound text tokens; include protocol/tool framing overhead.
    # Hosted search/image tokenization needs a full-context upper reservation.
    images=image_count>0
    input_upper=context if searches or images else min(context,text_bytes+4096)
    maximum=(Decimal(input_upper)*ri+Decimal(config.MAX_OUTPUT_TOKENS)*ro)/1000000+Decimal(searches)*Decimal('.01')
    res=usage.reserve(kind='llm',provider=provider,model=model,maximum_usd=maximum,
                      metadata={'input_token_cap':input_upper,'output_token_cap':config.MAX_OUTPUT_TOKENS,'search_call_cap':searches})
    usage.dispatch(res,request_sha256=hashlib.sha256(raw).hexdigest())
    return res

def _fail(res,exc):
    from app import usage
    status=getattr(exc,'status_code',None)
    if type(status) is int and status in (400,401,403,404,413,422,429):
        usage.settle(res,actual_usd=Decimal(0))
        raise ProviderFailure('provider_request_rejected') from None
    usage.uncertain(res,reason='transport_unknown')
    raise ProviderFailure('provider_response_unknown_may_be_charged') from None

def _settle(res,model,u,provider,searches,job):
    from app import usage
    if u is None:
        usage.settle(res,actual_usd=None,provider_job_id=job)
        raise ProviderFailure('provider_usage_unavailable')
    try:
        i=_int(u.input_tokens);o=_int(u.output_tokens)
        if provider=='openai':
            cached=_int(getattr(getattr(u,'input_tokens_details',None),'cached_tokens',0) or 0)
            reasoning=_int(getattr(getattr(u,'output_tokens_details',None),'reasoning_tokens',0) or 0)
            extra=0
        else:
            cached=_int(getattr(u,'cache_read_input_tokens',0) or 0)
            extra=_int(getattr(u,'cache_creation_input_tokens',0) or 0)
            reasoning=0;i+=cached+extra
        if cached>i or reasoning>o:raise ProviderFailure('invalid_provider_usage')
        ri,ro,rc,_=RATES[model]
        # No cache-write directives are used. If returned, conservatively price at2x.
        actual=((i-cached-extra)*ri+cached*rc+extra*ri*2+o*ro)/Decimal(1000000)+Decimal(searches)*Decimal('.01')
    except Exception:
        usage.settle(res,actual_usd=None,provider_job_id=job)
        raise ProviderFailure('provider_usage_unavailable') from None
    usage.settle(res,actual_usd=actual,input_tokens=i,output_tokens=o,cached_input_tokens=cached,
                 reasoning_output_tokens=reasoning,provider_job_id=job)

def _openai_messages(messages):
    out=[]
    for m in messages:
        content=m['content']
        if isinstance(content,str):content=[{'type':'text','text':content}]
        blocks=[]
        for b in content:
            if b['type']=='text':blocks.append({'type':'input_text','text':b['text']})
            elif b['type']=='image':
                src=b.get('source',{})
                if src.get('type')=='base64' and src.get('media_type') in ('image/png','image/jpeg','image/webp'):
                    url='data:'+src['media_type']+';base64,'+src['data']
                elif src.get('type')=='url':
                    url=src.get('url','')
                    # Owner/version checks happen before signed references are created.
                    from app.media_storage import validate_provider_reference
                    validate_provider_reference(url)
                else:raise ProviderFailure('unsupported_image_input')
                blocks.append({'type':'input_image','image_url':url})
            else:raise ProviderFailure('unsupported_content_block')
        out.append({'role':m['role'],'content':blocks})
    return out

def _tool_result(dispatcher,name,args):
    if name not in {x['name'] for x in TOOL_DEFS} or not isinstance(args,dict):raise ProviderFailure('unknown_tool_call')
    # Guard model-supplied retrieval fanout even if a schema marks k optional.
    if 'k' in args:args['k']=min(12,max(1,int(args['k'])))
    output=dispatcher.dispatch(name,args) if dispatcher else '{"error":"no tools available"}'
    if len(str(output).encode())>32768:raise ProviderFailure('tool_output_limit')
    return output

def openai_call(model,system,messages,dispatcher,use_tools,web_search,searched):
    import openai
    tools=[{'type':'function','name':t['name'],'description':t['description'],'parameters':t['input_schema'],'strict':False} for t in TOOL_DEFS] if use_tools else []
    search_left=config.WEB_SEARCH_MAX_USES if web_search and config.WEB_SEARCH else 0
    convo=_openai_messages(messages);started=time.monotonic()
    with openai.OpenAI(max_retries=0,base_url='https://api.openai.com/v1',http_client=_http()) as client:
        for turn in range(config.MAX_TOOL_TURNS):
            if time.monotonic()-started>config.MAX_AGENT_SECONDS:raise ProviderFailure('provider_deadline')
            active=tools+([{'type':'web_search','search_context_size':'low'}] if search_left else [])
            body={'model':model,'instructions':system,'input':convo,'max_output_tokens':config.MAX_OUTPUT_TOKENS,
                  'reasoning':{'effort':'none'},'store':False,'parallel_tool_calls':False,'tools':active}
            if search_left:body['max_tool_calls']=search_left
            res=_reserve('openai',model,body,search_left)
            try:response=client.responses.create(**body)
            except Exception as exc:_fail(res,exc)
            calls=[x for x in response.output if x.type=='web_search_call']
            actual_searches=len(calls)
            _settle(res,model,response.usage,'openai',actual_searches,response.id)
            search_left=max(0,search_left-actual_searches)
            for call in calls:
                action=getattr(call,'action',None)
                query=getattr(action,'query',None)
                if query and searched is not None and query not in searched:searched.append(query)
            if any(getattr(c,'type','')=='refusal' for item in response.output if getattr(item,'type','')=='message' for c in getattr(item,'content',[])):
                raise ProviderFailure('provider_policy_refusal')
            if response.status!='completed':raise ProviderTruncated('provider output incomplete; observed usage was recorded')
            functions=[x for x in response.output if x.type=='function_call']
            if functions:
                if len(functions)>8:raise ProviderFailure('tool_call_limit')
                convo.extend(x.model_dump(mode='json') for x in response.output)
                for call in functions:
                    args=json.loads(call.arguments)
                    result=_tool_result(dispatcher,call.name,args)
                    convo.append({'type':'function_call_output','call_id':call.call_id,'output':str(result)})
                continue
            return response.output_text
    raise ProviderFailure('tool_loop_limit')

def anthropic_call(model,system,messages,dispatcher,use_tools,web_search,searched):
    import anthropic
    tools=list(TOOL_DEFS) if use_tools else []
    search_left=config.WEB_SEARCH_MAX_USES if web_search and config.WEB_SEARCH else 0
    _openai_messages(messages)  # Validate the same image-reference boundary for either provider.
    convo=list(messages);started=time.monotonic()
    with anthropic.Anthropic(max_retries=0,base_url='https://api.anthropic.com',http_client=_anthropic_http()) as client:
        for turn in range(config.MAX_TOOL_TURNS):
            if time.monotonic()-started>config.MAX_AGENT_SECONDS:raise ProviderFailure('provider_deadline')
            active=tools+([{'type':'web_search_20250305','name':'web_search','max_uses':search_left}] if search_left else [])
            body={'model':model,'system':system,'messages':convo,'max_tokens':config.MAX_OUTPUT_TOKENS}
            if active:body['tools']=active
            res=_reserve('anthropic',model,body,search_left)
            try:
                with client.messages.stream(**body) as stream:response=stream.get_final_message()
            except Exception as exc:_fail(res,exc)
            searches=_int(getattr(getattr(response.usage,'server_tool_use',None),'web_search_requests',0) or 0)
            _settle(res,model,response.usage,'anthropic',searches,response.id)
            search_left=max(0,search_left-searches)
            for b in response.content:
                if b.type=='server_tool_use' and b.name=='web_search':
                    q=dict(b.input).get('query')
                    if q and searched is not None and q not in searched:searched.append(q)
            if response.stop_reason=='refusal':raise ProviderFailure('provider_policy_refusal')
            if response.stop_reason=='max_tokens':raise ProviderTruncated('provider output incomplete; observed usage was recorded')
            if response.stop_reason=='pause_turn':convo.append({'role':'assistant','content':response.content});continue
            if response.stop_reason=='tool_use':
                calls=[b for b in response.content if b.type=='tool_use']
                if len(calls)>8:raise ProviderFailure('tool_call_limit')
                convo.append({'role':'assistant','content':response.content})
                convo.append({'role':'user','content':[{'type':'tool_result','tool_use_id':b.id,'content':_tool_result(dispatcher,b.name,dict(b.input))} for b in calls]});continue
            return ''.join(b.text for b in response.content if b.type=='text')
    raise ProviderFailure('tool_loop_limit')
