"""Session-authored responses through production runner/driver; no live AI calls."""
import json, hashlib, os
from pathlib import Path
import pytest
from app import campaign, config, store
from app.agents import runner
from app.schemas import ShotBoard, UserEvent
from app.validators import validate_shot_board
from test_marketing import marketing_env, _text, _envelopes
from test_fmea_flow import _fake_images

ROOT=Path(__file__).resolve().parents[2]/'docs/qa/2026-10-02/proxy'
CASES=json.loads((ROOT/'session-responses.json').read_text())['cases']

def save_evidence(name,system,response,result):
    if not os.getenv('PLOTLINE_FMEA_EVIDENCE_DIR'): return
    folder=Path(os.environ['PLOTLINE_FMEA_EVIDENCE_DIR']);folder.mkdir(parents=True,exist_ok=True)
    (folder/(name+'.json')).write_text(json.dumps({'provenance':'Codex session-authored provider proxy; actual runner, schemas and driver; no paid/provider calls, placeholder media is not visual validation.','system_prompt':system,'system_sha256':hashlib.sha256(system.encode()).hexdigest(),'session_response':response,'driver_result':result},indent=2,default=str)+'\n')


def test_session_intake_single_person_product_full_driver_to_delivery(monkeypatch,tmp_path):
    from PIL import Image
    photo=tmp_path/'navy.png';Image.new('RGB',(80,100),'navy').save(photo)
    upload=store.add_upload('navy.png','image',str(photo),'image/png',None)
    start=campaign.start_campaign('Session proxy campaign');cid,tid=start['campaign_id'],start['thread']['id']
    original=campaign.run_agent;captured=[]
    def proxy_agent(**kwargs):
        agent=kwargs['agent']
        if agent not in ('campaign_intake','shot_board','canon_plan'):return original(**kwargs)
        if agent=='campaign_intake':
            msg=kwargs['user_payload']['message'].lower()
            case='intake_supplied_goal' if 'awareness' in msg else 'intake_yes_missing' if msg=='yes' else 'intake_photo'
        else:case='single_still' if agent=='shot_board' else 'canon_person_product'
        value=json.loads(json.dumps(CASES[case]).replace('__name__','Session proxy campaign').replace('__upload__',upload))
        def fake_call(model,system,*args,**opts):
            captured.append((case,system,value));return json.dumps(value)
        with monkeypatch.context() as patch:
            patch.setattr(config,'MOCK_LLM',False);patch.setattr(runner,'_llm_call',fake_call)
            obj,log=original(**kwargs)
        save_evidence(case,captured[-1][1],value,{'validated_output':obj.model_dump(mode='json'),'attempts':log.attempts})
        return obj,log
    monkeypatch.setattr(campaign,'run_agent',proxy_agent)
    monkeypatch.setattr(config,'MOCK_MEDIA',False)
    monkeypatch.setattr(campaign,'_seed_url',lambda aid,asset:f'/api/assets/{aid}/file')
    calls=_fake_images(monkeypatch)
    monkeypatch.setattr(campaign.usage,'media_capacity',lambda:{'remaining':6-len(calls),'owner_remaining':6-len(calls),'shared_remaining':20-len(calls),'scope':'lifetime'})
    campaign.handle_event(UserEvent(thread_id=tid,type='text',text='Summer campaign for casual t-shirts for young men',upload_ids=[upload]))
    assert campaign._context_of(cid).campaign is None and _envelopes(tid)[-1]['question']
    _text(tid,'yes');assert store.get_thread(tid)['stage']=='intake'
    assert campaign._context_of(cid).campaign is None and not calls
    _text(tid,'Awareness on Instagram feed');assert campaign._context_of(cid).complete
    _text(tid,'go ahead');assert store.get_thread(tid)['stage']=='brief'
    _text(tid,'regenerate and use brand - Anand');assert campaign._context_of(cid).brand.name=='Anand'
    assert not campaign._context_of(cid).brand.approved_claims
    _text(tid,'yes');_text(tid,'use the first one')
    assert store.get_thread(tid)['stage']=='detail'
    assert len(campaign._ws(tid)['board']['shots'])==1
    _text(tid,'yes');assert store.get_thread(tid)['stage']=='canon' and len(calls)==4
    campaign._WORKSPACES.clear();_text(tid,'yes')
    assert store.get_thread(tid)['stage']=='keyframes' and len(calls)==5
    _text(tid,'yes');_text(tid,'just one');assert store.get_thread(tid)['stage']=='creative'
    _text(tid,'make the background lighter');assert len(calls)==6
    _text(tid,'accept all');campaign._WORKSPACES.clear();_text(tid,'yes')
    assert store.get_thread(tid)['stage']=='done' and len(calls)==6
    assert store.list_ad_cards(cid)
    save_evidence('full-driver-result',captured[-1][1],CASES['canon_person_product'],{'final_stage':'done','media_proxy_calls':6,'restarts':2,'mandatory_inputs':['product photo','one line'],'business_goal_asked':True,'brand':'Anand','paid_calls':0,'visual_quality':'unverified'})


@pytest.mark.parametrize('case',['single_still','explicit_two_image_carousel'])
def test_session_board_actual_runner_preserves_requested_still_count(monkeypatch,case):
    seen=[]
    def fake(model,system,*args,**kw):seen.append(system);return json.dumps(CASES[case])
    monkeypatch.setattr(config,'MOCK_LLM',False);monkeypatch.setattr(runner,'_llm_call',fake)
    result,log=runner.run_agent(agent='session_proxy_board',prompt_name='shot_board',model=config.STAGE_MODELS['board'],user_payload={'request':'One still' if case=='single_still' else 'Two-image carousel'},schema=ShotBoard,validate=validate_shot_board,use_tools=False,prompt_replacements={'ref_slots':campaign.ref_slots_text()})
    assert len(result.shots)==(1 if case=='single_still' else 2)
    assert 'IMAGE CAMPAIGNS' in seen[0] and log.attempts==1
    save_evidence(case+'-runner',seen[0],CASES[case],result.model_dump(mode='json'))


@pytest.mark.parametrize('case',['malformed_output','refusal','truncation'])
def test_session_invalid_provider_proxy_never_yields_a_success(monkeypatch,case):
    seen=[]
    def fake(model,system,*args,**kw):
        seen.append(system)
        if case=='refusal':raise runner.AgentTransport('provider_policy_refusal')
        if case=='truncation':raise runner.AgentTruncated('max_output_tokens')
        return CASES[case]
    monkeypatch.setattr(config,'MOCK_LLM',False);monkeypatch.setattr(runner,'_llm_call',fake)
    with pytest.raises((runner.AgentHardFail,runner.AgentTransport)):
        runner.run_agent(agent='session_proxy_failure',prompt_name='shot_board',model=config.STAGE_MODELS['board'],user_payload={},schema=ShotBoard,use_tools=False)
    assert len(seen)==(1 if case=='refusal' else config.MAX_VALIDATION_RETRIES+1)
    save_evidence(case,seen[0],CASES[case],{'status':'refused','proxy_attempts':len(seen),'provider_dispatches':0})
