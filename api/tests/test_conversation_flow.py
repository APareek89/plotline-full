"""Actual conversational routing/runner/store with session-authored responses.
No live provider validation: text output is authored here and media is synthetic.
"""
from copy import deepcopy
import hashlib
import json
import os
from pathlib import Path

import pytest
from app import campaign, config, store
from app.agents import runner
from app.schemas import ArtifactEnvelope, UserEvent
from test_marketing import marketing_env, _ruminated, _generated, _text, _act, _envelopes, _pass_script
from test_fmea_flow import _fake_images

STAGES=['intake','brief','options','templates','script','detail','canon','keyframes','generate','creative','qc','done']


def proxy(monkeypatch, responses):
    original=campaign.run_agent; seen=[]
    def run(**kwargs):
        agent=kwargs['agent']
        if agent not in responses: return original(**kwargs)
        value=responses[agent](deepcopy(kwargs['user_payload']))
        def call(model,system,*args,**opts):
            seen.append({'agent':agent,'system_prompt':system,'system_sha256':hashlib.sha256(system.encode()).hexdigest(),
                         'user_payload':kwargs['user_payload'],'session_response':value})
            return json.dumps(value)
        with monkeypatch.context() as patch:
            patch.setattr(config,'MOCK_LLM',False);patch.setattr(runner,'_llm_call',call)
            result,log=original(**kwargs)
        seen[-1]['validated_result']=result.model_dump(mode='json');seen[-1]['attempts']=log.attempts
        if os.getenv('PLOTLINE_FMEA_EVIDENCE_DIR'):
            folder=Path(os.environ['PLOTLINE_FMEA_EVIDENCE_DIR']).parent/'conversation';folder.mkdir(exist_ok=True)
            key=hashlib.sha256(json.dumps(value,sort_keys=True).encode()).hexdigest()[:12]
            (folder/(agent+'-'+key+'.json')).write_text(json.dumps({'provenance':'Session-authored response through actual composed prompt, runner and driver; no provider call',**seen[-1]},indent=2)+'\n')
        return result,log
    monkeypatch.setattr(campaign,'run_agent',run)
    return seen


def deny(*args,**kwargs): raise AssertionError('Information/review must not invoke a provider')


@pytest.mark.parametrize('stage',STAGES)
def test_information_questions_at_every_stage_never_mutate_or_dispatch(monkeypatch,stage):
    cid,tid=_ruminated('Question at '+stage)
    store.set_thread_stage(tid,stage)
    before=store.get_series(cid)['context'];assets=store.list_assets(thread_id=tid)
    monkeypatch.setattr(campaign,'run_agent',deny);monkeypatch.setattr(campaign,'generate',deny)
    for text in ('Why this audience?', 'What does this cost?', 'How do I remove the background?'):
        _text(tid,text)
        assert store.get_thread(tid)['stage']==stage
        assert store.get_series(cid)['context']==before
        assert store.list_assets(thread_id=tid)==assets
        assert _envelopes(tid)[-1]['question']


@pytest.mark.parametrize('stage',STAGES[1:])
def test_late_facts_at_every_stage_use_actual_conversation_prompt_and_preserve_other_fields(monkeypatch,stage):
    cid,tid=_ruminated('Late correction '+stage)
    store.set_thread_stage(tid,stage);before=campaign._context_of(cid).model_dump(mode='json')
    def response(payload):
        value=payload['context'];value['campaign']['target_audience']='college students aged 18–24'
        return {'intent':'context','context':value,'reply':''}
    seen=proxy(monkeypatch,{'campaign_conversation':response})
    monkeypatch.setattr(campaign,'generate',deny)
    _text(tid,"Actually we're targeting college students aged 18–24 instead")
    after=campaign._context_of(cid).model_dump(mode='json')
    assert after['campaign']['target_audience']=='college students aged 18–24'
    assert after['product']==before['product'] and after['brand']==before['brand']
    assert store.get_thread(tid)['stage']=='brief'
    assert len(seen)==1 and seen[0]['attempts']==1
    assert 'CAMPAIGN CONVERSATION' in seen[0]['system_prompt']
    campaign._WORKSPACES.clear();campaign._rehydrate(tid,campaign._ws(tid))
    assert campaign._ws(tid)['brief']['audience']=='college students aged 18–24'


def test_noop_interpretation_does_not_clear_current_state_or_checkpoints(monkeypatch):
    cid,tid=_generated('Noop correction');before=deepcopy(campaign._ws(tid)['items'])
    store.save_checkpoint(tid,'kept',{'value':'paid checkpoint'})
    proxy(monkeypatch,{'campaign_conversation':lambda p:{'intent':'unclear','context':p['context'],'reply':'Which detail should change?'}})
    monkeypatch.setattr(campaign,'generate',deny)
    _text(tid,'hmm, not sure yet')
    assert store.get_thread(tid)['stage']=='creative' and campaign._ws(tid)['items']==before
    assert store.load_checkpoint(tid,'kept')=={'value':'paid checkpoint'}
    assert _envelopes(tid)[-1]['question']['options']


def test_compound_option_approval_routes_complete_correction_before_approval(monkeypatch):
    cid,tid=_ruminated('Approval plus amendment');seen=[]
    monkeypatch.setattr(campaign,'_options_turn',lambda *args:seen.append(args))
    _text(tid,'Use the first one, but make the background lighter')
    assert len(seen)==1 and seen[0][2]=='Use the first one, but make the background lighter'
    assert seen[0][3]==['o1']
    assert campaign._ws(tid).get('approved_option') is None
    assert store.get_thread(tid)['stage']=='options'


def test_board_edit_changes_source_and_projection_then_survives_restart(monkeypatch):
    cid,tid=_generated('Board edit source');old_assets=store.list_assets(thread_id=tid)
    ws=campaign._ws(tid);before=deepcopy(ws['board'])
    store.set_thread_stage(tid,'keyframes')
    def response(payload):
        assert payload['user_feedback']=='Make the background lighter, and keep the product unchanged'
        result=payload['previous_board'];result['shots'][0]['keyframe_prompt']='The same product against a pale neutral background'
        return result
    seen=proxy(monkeypatch,{'shot_board':response});monkeypatch.setattr(campaign,'generate',deny)
    _text(tid,'Make the background lighter, and keep the product unchanged')
    assert store.get_thread(tid)['stage']=='detail' and len(seen)==1
    assert ws['board']['shots'][0]['keyframe_prompt']!=before['shots'][0]['keyframe_prompt']
    assert not ws['items'] and ws['keyframes'] is None
    assert store.list_assets(thread_id=tid)==old_assets
    edited=deepcopy(ws['board']);detail=deepcopy(ws['detail'])
    campaign._WORKSPACES.clear();ws=campaign._ws(tid);campaign._rehydrate(tid,ws)
    assert ws['board']==edited and ws['detail']==detail and not ws['items'] and ws['keyframes'] is None
    assert 'approve_board' in [o['event'] for o in _envelopes(tid)[-1]['question']['options']]


def test_delivered_multi_image_feedback_keeps_verbatim_note_across_question_and_reload(monkeypatch):
    cid,tid=_generated('Delivered correction');_act(tid,'creative','accept_all');_text(tid,'yes')
    assert store.get_thread(tid)['stage']=='done'
    old_cards=deepcopy(store.list_ad_cards(cid));old_items=deepcopy(campaign._ws(tid)['items'])
    assert len(old_items)==2
    calls=_fake_images(monkeypatch)
    note='Make the background lighter but preserve the original logo'
    _text(tid,note);assert not calls and store.get_thread(tid)['stage']=='done'
    assert _envelopes(tid)[-1]['question']['text']=='Which image should I change?'
    campaign._WORKSPACES.clear();_text(tid,'the first one')
    assert len(calls)==1 and note in calls[0][0]
    assert store.get_thread(tid)['stage']=='creative'
    assert store.list_ad_cards(cid)==old_cards
    assert campaign._ws(tid)['items'][1]['asset_id']==old_items[1]['asset_id']
    assert campaign._ws(tid)['items'][0]['asset_id']!=old_items[0]['asset_id']


def test_current_capacity_question_yes_means_saved_reference_review_not_canon_approval(monkeypatch):
    cid,tid=_ruminated('Current ask authority');store.set_thread_stage(tid,'canon')
    campaign._say(tid,'Capacity is exhausted.',[ArtifactEnvelope(type='escalation',id='media_capacity',title='Review saved work',
        payload={},actions=campaign._actions(('reuse_saved_canon','Review saved references','primary'),('compact_image_plan','Review one image','secondary')))],question='Review saved references?')
    seen=[];monkeypatch.setattr(campaign,'_reuse_saved_canon',lambda *a:seen.append(a));monkeypatch.setattr(campaign,'generate',deny)
    _text(tid,'yes')
    assert seen==[(tid,cid)] and store.get_thread(tid)['stage']=='canon'


def test_claim_confirmation_is_answerable_in_plain_language(monkeypatch):
    cid,tid=_ruminated('Natural claims');context=campaign._context_of(cid)
    context.brand.claims_confirmed=False;store.update_series_context(cid,context.model_dump(mode='json'));store.set_thread_stage(tid,'intake')
    campaign._progress_turn(tid,context)
    monkeypatch.setattr(campaign,'run_agent',deny);monkeypatch.setattr(campaign,'generate',deny)
    _text(tid,'none of them')
    assert campaign._context_of(cid).brand.claims_confirmed
    assert campaign._context_of(cid).brand.approved_claims==[]
    assert _envelopes(tid)[-1]['question']['options'][0]['event']=='begin'


def test_late_upload_invalidates_outputs_only_after_valid_context_and_keeps_paid_files(monkeypatch,tmp_path):
    from PIL import Image
    cid,tid=_generated('Late photo');old_assets=store.list_assets(thread_id=tid)
    photo=tmp_path/'new.png';Image.new('RGB',(32,40),'navy').save(photo)
    uid=store.add_upload('new.png','image',str(photo),'image/png',cid)
    proxy(monkeypatch,{'campaign_conversation':lambda p:{'intent':'context','context':p['context'],'reply':''}})
    monkeypatch.setattr(campaign,'generate',deny)
    campaign.handle_event(UserEvent(thread_id=tid,type='text',text='Also use this product view',upload_ids=[uid]))
    assert uid in campaign._context_of(cid).product.image_upload_ids
    assert store.get_thread(tid)['stage']=='brief' and not campaign._ws(tid)['items']
    assert store.list_assets(thread_id=tid)==old_assets


@pytest.mark.parametrize('stage',STAGES[1:])
def test_approval_plus_change_never_dispatches_approval_first(monkeypatch,stage):
    cid,tid=_ruminated('Compound '+stage);store.set_thread_stage(tid,stage)
    calls=[]
    monkeypatch.setattr(campaign,'_revise_turn',lambda *args:calls.append(args))
    monkeypatch.setattr(campaign,'generate',deny)
    text='Yes, but make the opening more playful'
    _text(tid,text)
    assert calls==[(tid,cid,text)]
    assert store.get_thread(tid)['stage']==stage


def test_informal_creative_feedback_uses_actual_prompt_then_requests_item_choice(monkeypatch):
    cid,tid=_generated('Informal feedback');calls=_fake_images(monkeypatch)
    seen=proxy(monkeypatch,{'campaign_conversation':lambda p:{'intent':'creative','context':p['context'],'reply':''}})
    _text(tid,"It's too dark for a summer campaign")
    assert not calls and len(seen)==1
    assert _envelopes(tid)[-1]['question']['text']=='Which image should I change?'
    _text(tid,'the first one, and keep the original logo')
    assert len(calls)==1
    assert "It's too dark for a summer campaign" in calls[0][0]
    assert 'the first one, and keep the original logo' in calls[0][0]


def test_late_claim_change_returns_to_explicit_confirmation_not_automatic_approval(monkeypatch):
    cid,tid=_generated('Revised claim');current=campaign._context_of(cid)
    assert current.brand.claims_confirmed
    def response(p):
        p['context']['brand']['approved_claims']=['Made with recycled packaging']
        p['context']['brand']['claims_confirmed']=False
        return {'intent':'context','context':p['context'],'reply':''}
    proxy(monkeypatch,{'campaign_conversation':response});monkeypatch.setattr(campaign,'generate',deny)
    _text(tid,'Replace the claim with Made with recycled packaging')
    context=campaign._context_of(cid)
    assert not context.brand.claims_confirmed
    assert store.get_thread(tid)['stage']=='intake'
    assert _envelopes(tid)[-1]['question']['multi']
    _text(tid,'none of them')
    assert campaign._context_of(cid).brand.approved_claims==[]


def test_failed_conversation_interpretation_preserves_paid_outputs(monkeypatch):
    from app.agents.runner import AgentValidationError
    cid,tid=_generated('Invalid interpretation');before=deepcopy(campaign._ws(tid)['items'])
    context=store.get_series(cid)['context']
    def reject(**kwargs): raise AgentValidationError(['invalid structured response'])
    monkeypatch.setattr(campaign,'run_agent',reject);monkeypatch.setattr(campaign,'generate',deny)
    _text(tid,'Actually we target families')
    assert campaign._ws(tid)['items']==before and store.get_series(cid)['context']==context
    assert _envelopes(tid)[-1]['question']['options'][0]['event']=='retry'


def test_busy_turn_is_durable_but_not_silently_applied(monkeypatch):
    cid,tid=_generated('Busy change');before=store.get_series(cid)['context']
    campaign._working[tid]='rendering'
    monkeypatch.setattr(campaign,'run_agent',deny);monkeypatch.setattr(campaign,'generate',deny)
    try:
        _text(tid,'Change the audience to families')
        assert store.get_series(cid)['context']==before
        assert 'has not applied it' in _envelopes(tid)[-1]['text']
        assert any(m['role']=='user' and m['envelope'].get('text')=='Change the audience to families' for m in store.get_messages(tid))
    finally: campaign._working.pop(tid,None)
