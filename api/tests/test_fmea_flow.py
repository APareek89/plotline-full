"""Oct 2 proxy fixtures: actual driver/store/validators, no provider validation.

Structured stage outputs below are authored against current prompts during the
review. Image bytes are placeholders and never evidence of real visual quality.
"""
import json
import pytest
from app import campaign, config, media, store
from app.schemas import CanonSheet, ShotBoard
from app.validators import validate_shot_board
from test_marketing import marketing_env, _board, _shot, _ruminated as _legacy_ruminated, _text, _artifacts, _envelopes, _act


def _ruminated(name):
    """These one-placement capacity cases explicitly use the Instagram-feed output."""
    cid,tid=_legacy_ruminated(name)
    context=campaign._context_of(cid)
    context.campaign.platforms=['instagram_feed']
    store.update_series_context(cid,context.model_dump(mode='json'))
    return cid,tid


def test_single_still_with_person_does_not_require_video_screen_time():
    board=ShotBoard.model_validate(_board(shots=[_shot(cast_refs=['@person'], product_refs=['@product'])]))
    assert len(validate_shot_board(board).shots)==1
    assert board.lints.runtime.status=='pass'


def test_partial_canon_retry_reuses_completed_anchor_after_restart(monkeypatch):
    cid,tid=_ruminated('Partial canon proxy')
    sheet=CanonSheet(id='@product',kind='product',label='Product',brief='Navy tee',rights='owned')
    calls=[]
    def generate(kind,prompt,**kwargs):
        calls.append(prompt)
        if len(calls)==2:raise media.MediaError('fixture sheet transport failed')
        dest=config.ASSET_DIR/f'partial_{len(calls)}.svg';media._mock_image(prompt,kwargs.get('ratio','1:1'),dest)
        return {'path':str(dest),'kind':'image','model':'fixture','provider':'fixture','cost':0,'refs_used':kwargs.get('image_urls',[])}
    monkeypatch.setattr(campaign,'generate',generate)
    with pytest.raises(media.MediaError):campaign._render_canon_views(tid,[sheet],cid)
    saved_assets=store.list_assets(thread_id=tid)
    assert len(saved_assets)==1
    anchor_id=saved_assets[0]['id']
    campaign._WORKSPACES.clear()
    result=campaign._render_canon_views(tid,[sheet],cid)[0]
    assert len(calls)==3, 'Explicit Retry must not re-render the paid anchor'
    assert result.anchor_asset_id==anchor_id


def test_canon_unverified_person_is_refused_before_any_render(monkeypatch):
    cid,tid=_ruminated('Consent gate proxy')
    sheet=CanonSheet(id='@real_person',kind='character',label='Person',brief='Real identifiable person',rights='unverified')
    calls=[]
    def generate(kind,prompt,**kwargs):
        calls.append(prompt)
        dest=config.ASSET_DIR/f'consent_{len(calls)}.svg';media._mock_image(prompt,kwargs.get('ratio','1:1'),dest)
        return {'path':str(dest),'kind':'image','model':'fixture','provider':'fixture','cost':0}
    monkeypatch.setattr(campaign,'generate',generate)
    with pytest.raises(Exception,match='rights|consent|unverified'):campaign._render_canon_views(tid,[sheet],cid)
    assert not calls, 'Rights failure must be caught before paying for two images'


def _fake_images(monkeypatch, fail_at=None):
    calls=[]
    def render(kind,prompt,**kwargs):
        calls.append((prompt,kwargs))
        if len(calls)==fail_at:raise media.MediaError('fixture transport failure')
        dest=config.ASSET_DIR/f'proxy_{len(calls)}.svg';media._mock_image(prompt,kwargs.get('ratio','1:1'),dest)
        return {'path':str(dest),'kind':'image','model':'proxy','provider':'proxy','cost':0,
                'refs_used':kwargs.get('image_urls',[]),'dropped_refs':[]}
    monkeypatch.setattr(campaign,'generate',render)
    return calls


def test_multi_reference_board_preflights_all_remaining_work_without_dispatch(monkeypatch):
    cid,tid=_ruminated('Capacity proxy')
    board=_board(shots=[_shot(cast_refs=['@person'],product_refs=['@product'],env_refs=['@room'])]*2)
    monkeypatch.setattr(campaign,'_sample_media',lambda:False)
    monkeypatch.setattr(campaign.usage,'media_capacity',lambda:{'remaining':6,'owner_remaining':6,'shared_remaining':20,'scope':'lifetime'})
    calls=_fake_images(monkeypatch)
    assert campaign._media_plan(board,cid)['minimum_operations']==8
    assert not campaign._capacity_gate(tid,cid,board)
    assert not calls
    last=_envelopes(tid)[-1]
    assert 'lifetime' in last['artifacts'][0]['payload']['reason']
    assert 'at least 8' in last['artifacts'][0]['payload']['reason']
    assert [x['event'] for x in last['question']['options']]==['compact_image_plan']


def test_compact_plan_is_explicit_preserves_person_product_and_paid_environment(monkeypatch):
    cid,tid=_ruminated('Compact proxy')
    board=_board(shots=[_shot(cast_refs=['@person'],product_refs=['@product'],env_refs=['@room']),_shot('shot_02',product_refs=['@product'])])
    ws=campaign._ws(tid);ws['board']=board
    calls=_fake_images(monkeypatch)
    assert campaign._media_plan(board,cid)['minimum_operations']==8
    assert len(ws['board']['shots'])==2, 'Estimation cannot shrink a user carousel'
    campaign._compact_image_plan(tid,cid)
    current=ws['board']['shots'][0]
    assert current['cast_refs']==['@person'] and current['product_refs']==['@product'] and current['env_refs']==[]
    assert campaign._media_plan(ws['board'],cid)['minimum_operations']==5
    assert not calls
    assert 'approve_board' in [x['event'] for x in _envelopes(tid)[-1]['question']['options']]
    campaign._WORKSPACES.clear();restored=campaign._ws(tid);campaign._rehydrate(tid,restored)
    assert len(restored['board']['shots'])==1


def test_canon_plan_checkpoint_retry_keeps_ids_and_does_not_pay_planner_twice(monkeypatch):
    from app.schemas import CanonPlan
    cid,tid=_ruminated('Plan checkpoint proxy')
    ws=campaign._ws(tid);ws['board']=_board(shots=[_shot(product_refs=['@product'])])
    planned=[]
    def agent(**kwargs):
        planned.append(kwargs['agent'])
        return CanonPlan(sheets=[CanonSheet(id='@product',kind='product',label='Tee',brief='Navy tee',rights='owned')]),None
    monkeypatch.setattr(campaign,'run_agent',agent)
    calls=_fake_images(monkeypatch,fail_at=2)
    campaign._canon_turn(tid,cid)
    assert len(calls)==2 and len(planned)==1
    campaign._WORKSPACES.clear();ws=campaign._ws(tid);ws['board']=_board(shots=[_shot(product_refs=['@product'])])
    campaign._canon_turn(tid,cid)
    assert len(calls)==3 and len(planned)==1
    assert ws['canon'][0]['id']=='@product'
    # Once complete, even a missing checkpoint can reuse exact owned library IDs.
    monkeypatch.setattr(store,'load_checkpoint',lambda *args:None)
    campaign._canon_turn(tid,cid)
    assert len(calls)==3 and len(planned)==1


def test_keyframe_partial_retry_only_renders_missing_shot_and_invalidates_changed_input(monkeypatch):
    cid,tid=_ruminated('Keyframe checkpoint proxy')
    ws=campaign._ws(tid);ws['board']=_board(shots=[_shot('one'),_shot('two')])
    calls=_fake_images(monkeypatch,fail_at=2)
    campaign._keyframes_turn(tid,cid)
    assert len(calls)==2
    before=store.list_assets(thread_id=tid)[0]['id']
    campaign._WORKSPACES.clear();ws=campaign._ws(tid);campaign._rehydrate(tid,ws);ws['board']=_board(shots=[_shot('one'),_shot('two')]);ws['resuming']=True
    campaign._keyframes_turn(tid,cid)
    assert len(calls)==3 and ws['keyframes']['frames'][0]['asset_id']==before
    ws['board']['shots'][0]['keyframe_prompt']='Explicitly changed scene'
    ws['resuming']=True
    campaign._keyframes_turn(tid,cid)
    assert len(calls)==5, 'Changed fingerprint cannot reuse outdated frame'


def test_sharper_failure_keeps_old_library_and_board_bindings(monkeypatch):
    cid,tid=_ruminated('Sharper failure proxy')
    calls=_fake_images(monkeypatch)
    original=campaign._render_canon_views(tid,[CanonSheet(id='@product',kind='product',label='Product',brief='Navy tee',rights='owned')],cid)[0]
    row=store.get_canon_sheet(original.id)
    ws=campaign._ws(tid);ws['canon']=[original.model_dump(mode='json')];ws['board']=_board(shots=[_shot(product_refs=['@product'])])
    monkeypatch.setattr(campaign,'generate',lambda *a,**kw: (_ for _ in ()).throw(media.MediaError('fixture')))
    campaign._resheet_turn(tid,cid)
    assert store.get_canon_sheet(original.id)==row
    assert ws['board']['shots'][0]['product_refs']==['@product']
    assert ws['canon'][0]['asset_ids']==original.asset_ids


def test_saved_reference_rebinding_is_explicit_and_survives_reload(monkeypatch):
    cid,tid=_ruminated('Rebinding proxy')
    calls=_fake_images(monkeypatch)
    sheets=campaign._render_canon_views(tid,[CanonSheet(id='@product',kind='product',label='Product',brief='Navy tee',rights='owned'),CanonSheet(id='@room',kind='environment',label='Room',brief='Neutral studio',rights='fictional')],cid)
    ws=campaign._ws(tid);ws['canon']=[x.model_dump(mode='json') for x in sheets]
    ws['board']=_board(shots=[_shot(product_refs=['@new_product'],env_refs=['@new_room'])])
    assert campaign._previous_canon_bindings(tid,ws['board'])=={'@new_product':'@product','@new_room':'@room'}
    assert ws['board']['shots'][0]['product_refs']==['@new_product']
    count=len(calls)
    campaign._reuse_saved_canon(tid,cid)
    assert len(calls)==count and ws['board']['shots'][0]['product_refs']==['@product']
    campaign._WORKSPACES.clear();ws=campaign._ws(tid);campaign._rehydrate(tid,ws)
    assert ws['board']['shots'][0]['env_refs']==['@room']
    assert ws['canon'][0]['asset_ids']==sheets[0].asset_ids


def test_canon_plan_rejects_duplicate_ids_and_reference_kind_confusion():
    from app.schemas import CanonPlan
    from app.validators import AgentValidationError
    product=CanonSheet(id='@product',kind='product',label='Tee',brief='Navy tee',rights='owned')
    board=_board(shots=[_shot(product_refs=['@product'])])
    with pytest.raises(AgentValidationError,match='Duplicate'):
        campaign._validate_canon_plan(CanonPlan(sheets=[product,product]),board)
    with pytest.raises(AgentValidationError,match='kind'):
        campaign._validate_canon_plan(CanonPlan(sheets=[product.model_copy(update={'kind':'environment'})]),board)


def test_historical_paid_canon_recoverable_after_intake_reset_and_renamed_board(monkeypatch):
    from app.schemas import ArtifactEnvelope
    cid,tid=_ruminated('Historical reset proxy')
    calls=_fake_images(monkeypatch)
    sheets=campaign._render_canon_views(tid,[CanonSheet(id='@old_product',kind='product',label='Tee',brief='Navy tee',rights='owned')],cid)
    campaign._say(tid,'Review saved sheets.',[ArtifactEnvelope(type='canon_sheet',id='canon',title='Canon',payload={'sheets':[x.model_dump(mode='json') for x in sheets]})])
    campaign._say(tid,'The brief was changed.',[ArtifactEnvelope(type='intake_progress',id='intake',title='Intake',payload={'reset_creative':True})])
    board=ShotBoard.model_validate(_board(shots=[_shot(product_refs=['@renamed_product'])]))
    campaign._say(tid,'Review the new board.',[ArtifactEnvelope(type='campaign_detail',id='board',title='Board',payload={'board':board.model_dump(mode='json'),'detail':campaign._detail_from_board(board,None)})])
    campaign._WORKSPACES.clear();ws=campaign._ws(tid);campaign._rehydrate(tid,ws)
    assert not ws.get('canon'), 'Earlier approval must stay cleared'
    assert campaign._previous_canon_bindings(tid,ws['board'])=={'@renamed_product':'@old_product'}
    campaign._reuse_saved_canon(tid,cid)
    assert len(calls)==2 and ws['canon'][0]['asset_ids']==sheets[0].asset_ids
    assert ws['board']['shots'][0]['product_refs']==['@old_product']
    assert 'approve_canon' in [x['event'] for x in _envelopes(tid)[-1]['question']['options']]


@pytest.mark.parametrize('query',['sslmode=disable','ssl=no-verify','sslrootcert=/not-read&sslcert=/not-read','requiressl=0&gssencmode=require','%73slmode=prefer&uselibpqcompat=true'])
def test_python_database_url_cannot_override_verified_tls(monkeypatch,tmp_path,query):
    from app import database
    from psycopg.conninfo import conninfo_to_dict
    ca=tmp_path/'ca.pem';ca.write_text('OFFLINE_FIXTURE_CA')
    monkeypatch.setenv('DATABASE_URL','postgresql://synthetic:fixture@db.invalid/plotline?'+query)
    monkeypatch.setenv('DATABASE_SSL_CA_FILE',str(ca));monkeypatch.delenv('DATABASE_SSL',raising=False)
    settings=database.parameters();conninfo=settings.pop('conninfo');settings.pop('row_factory')
    parsed=conninfo_to_dict(conninfo,**settings)
    assert parsed['sslmode']=='verify-full' and parsed['sslrootcert']==str(ca)
    assert parsed['gssencmode']=='disable'


def test_capacity_discounts_same_input_anchor_and_keyframe_checkpoints(monkeypatch):
    from app.schemas import CanonPlan
    cid,tid=_ruminated('Remaining capacity proxy')
    ws=campaign._ws(tid);board=_board(shots=[_shot(product_refs=['@product'])]);ws['board']=board
    plan=CanonPlan(sheets=[CanonSheet(id='@product',kind='product',label='Tee',brief='Navy tee',rights='owned')])
    store.save_checkpoint(tid,'_canon_plan',{'input_sha256':campaign._canon_plan_sha(board,cid),'plan':plan.model_dump(mode='json')})
    calls=_fake_images(monkeypatch,fail_at=2)
    with pytest.raises(media.MediaError):campaign._render_canon_views(tid,plan.sheets,cid)
    assert campaign._media_plan(board,cid,tid)['minimum_operations']==2, 'One sheet plus one keyframe, not three'
    monkeypatch.setattr(campaign,'_sample_media',lambda:False)
    monkeypatch.setattr(campaign.usage,'media_capacity',lambda:{'remaining':2,'owner_remaining':2,'shared_remaining':2,'scope':'lifetime'})
    assert campaign._capacity_gate(tid,cid,board)
    sheets=campaign._render_canon_views(tid,plan.sheets,cid);ws['canon']=[x.model_dump(mode='json') for x in sheets]
    campaign._keyframes_turn(tid,cid)
    count=len(calls)
    assert campaign._media_plan(board,cid,tid)['minimum_operations']==0
    campaign._keyframes_turn(tid,cid)
    assert len(calls)==count, 'Ordinary continuation must reuse exact successful frames'
    ws['regenerate_keyframes']=True
    campaign._keyframes_turn(tid,cid)
    assert len(calls)==count+1, 'Explicit Re-render must create one new frame'


def test_safe_failure_diagnostics_are_correlated_and_do_not_persist_provider_body(monkeypatch,caplog):
    from app import execution
    from app.rag_client import RagUnavailable
    cid,tid=_ruminated('Safe error proxy')
    actor=execution.require_execution()
    monkeypatch.setattr(execution,'fixture_mode',lambda:False)
    with execution.execution_scope(actor):
        try:
            raise RagUnavailable('SECRET_SENTINEL https://private.invalid/?token=SECRET_SENTINEL')
        except RagUnavailable:
            campaign._fail(tid,'SECRET_SENTINEL','SECRET_SENTINEL traceback')
    last=_envelopes(tid)[-1];artifact=last['artifacts'][0]
    assert artifact['title']=='Evidence service unavailable'
    assert artifact['payload']['category']=='retrieval_unavailable'
    support=artifact['payload']['support_id'];assert support.startswith('support_')
    saved=store.get_artifact_activity(tid,support)
    assert len(saved)==1 and support in saved[0]['detail']
    assert 'SECRET_SENTINEL' not in json.dumps(last)+json.dumps(saved)+caplog.text
    assert 'private.invalid' not in caplog.text


def test_failure_logging_survives_unavailable_state_store(monkeypatch,caplog):
    from app import execution
    cid,tid=_ruminated('Unavailable state proxy')
    monkeypatch.setattr(execution,'fixture_mode',lambda:False)
    def unavailable(*args,**kwargs):raise OSError('PRIVATE_DATABASE_LOCATION')
    monkeypatch.setattr(store,'get_thread',unavailable)
    monkeypatch.setattr(store,'log_artifact_activity',unavailable)
    monkeypatch.setattr(campaign,'_say',lambda *args,**kwargs:None)
    try:
        raise OSError('PRIVATE_DATABASE_LOCATION')
    except OSError:
        campaign._fail(tid,'PRIVATE_DATABASE_LOCATION','PRIVATE_DATABASE_LOCATION')
    assert 'campaign_failure ' in caplog.text and '"stage": "unknown"' in caplog.text
    assert '"exception_class": "OSError"' in caplog.text
    assert 'campaign_failure_record_unavailable support_' in caplog.text
    assert 'PRIVATE_DATABASE_LOCATION' not in caplog.text


def test_failed_job_recovery_coexists_with_current_saved_reference_question(monkeypatch):
    """Real GET payload: a failed job must not hide newer free recovery choices."""
    from app import main
    from app.schemas import ArtifactEnvelope
    from pathlib import Path
    import hashlib
    cid,tid=_ruminated('Failed job with current recovery choices')
    calls=_fake_images(monkeypatch)
    specs=[CanonSheet(id='@old_person',kind='character',label='Person',brief='Fictional person',rights='fictional'),
           CanonSheet(id='@old_product',kind='product',label='Tee',brief='Navy tee',rights='owned'),
           CanonSheet(id='@old_room',kind='environment',label='Room',brief='Empty studio',rights='fictional')]
    sheets=campaign._render_canon_views(tid,specs,cid)
    before={a['id']:hashlib.sha256(Path(a['path']).read_bytes()).hexdigest() for a in store.list_assets(thread_id=tid)}
    campaign._say(tid,'Review saved sheets.',[ArtifactEnvelope(type='canon_sheet',id='canon',title='Canon',payload={'sheets':[x.model_dump(mode='json') for x in sheets]})])
    campaign._say(tid,'The brief changed.',[ArtifactEnvelope(type='intake_progress',id='intake',title='Intake',payload={'reset_creative':True})])
    board=ShotBoard.model_validate(_board(shots=[_shot('one',cast_refs=['@new_person'],product_refs=['@new_product'],env_refs=['@new_room']),_shot('two',cast_refs=['@new_person'],product_refs=['@new_product'],env_refs=['@new_room'])]))
    campaign._say(tid,'Review the new board.',[ArtifactEnvelope(type='campaign_detail',id='board',title='Board',payload={'board':board.model_dump(mode='json'),'detail':campaign._detail_from_board(board,None)})])
    store.set_thread_stage(tid,'canon')
    store.save_checkpoint(tid,'_last_job',{'operation':'_canon_turn','args':[tid,cid]})
    job=store.create_run(cid,'job:'+tid)
    store.finish_run(job,'failed','stage_failed')
    campaign._WORKSPACES.clear();ws=campaign._ws(tid);campaign._rehydrate(tid,ws)
    def forbidden(*args,**kwargs):raise AssertionError('Free recovery must not invoke a provider')
    monkeypatch.setattr(campaign,'generate',forbidden)
    monkeypatch.setattr(campaign,'run_agent',forbidden)
    monkeypatch.setattr(campaign,'_sample_media',lambda:False)
    monkeypatch.setattr(campaign.usage,'media_capacity',lambda:{'remaining':0,'owner_remaining':0,'shared_remaining':2,'scope':'lifetime'})
    assert not campaign._capacity_gate(tid,cid,ws['board'])
    response=main.get_thread(tid)
    assert response['job_status']=='failed' and response['recovery']['event']=='retry'
    question=response['messages'][-1]['envelope']['question']
    assert [o['event'] for o in question['options']]==['reuse_saved_canon','compact_image_plan']
    _act(tid,'media_capacity','reuse_saved_canon')
    campaign._WORKSPACES.clear();ws=campaign._ws(tid);campaign._rehydrate(tid,ws)
    restored=main.get_thread(tid)
    assert restored['job_status']=='failed' and restored['recovery']['event']=='retry'
    assert [o['event'] for o in restored['messages'][-1]['envelope']['question']['options']]==['approve_canon','compact_image_plan']
    assert ws['board']['shots'][0]['product_refs']==['@old_product']
    assert {a['id']:hashlib.sha256(Path(a['path']).read_bytes()).hexdigest() for a in store.list_assets(thread_id=tid)}==before
    assert len(calls)==6
