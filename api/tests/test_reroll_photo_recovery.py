"""Actual driver/store recovery, production photo checks, authored media only."""
from copy import deepcopy
from PIL import Image
import pytest
from app import campaign, config, execution, store
from app.schemas import UserEvent
from test_marketing import marketing_env, _generated, _act, _text, _envelopes
from test_fmea_flow import _fake_images


def deny(*args, **kwargs):
    raise AssertionError('Recovery must not call a language model')


def setup_missing(monkeypatch, tmp_path):
    cid, tid = _generated('Missing product photo recovery')
    context = campaign._context_of(cid)
    context.product.image_upload_ids = []
    store.update_series_context(cid, context.model_dump(mode='json'))
    old = deepcopy(campaign._ws(tid)['items'])
    photo = tmp_path/'owned.png'; Image.new('RGB',(32,40),'navy').save(photo)
    uid = store.add_upload('owned.png','image',str(photo),'image/png',cid)
    # Synthetic immutable-ref metadata stands in for S3; owned lookup is real.
    store.get_conn().execute('UPDATE uploads SET storage_ref=? WHERE id=?', ('{"fixture":true}',uid))
    store.get_conn().commit()
    monkeypatch.setattr(config,'MOCK_MEDIA',False)
    monkeypatch.setattr(execution,'fixture_mode',lambda:False)
    monkeypatch.setattr(execution,'is_cached',lambda:False)
    monkeypatch.setattr(campaign,'run_agent',deny)
    calls=_fake_images(monkeypatch)
    monkeypatch.setattr(campaign,'_product_reference_urls',lambda c:['owned:'+x for x in c.product.image_upload_ids])
    monkeypatch.setattr(campaign,'_seed_url',lambda aid,asset:'owned-asset:'+aid)
    return cid,tid,uid,old,calls


def upload(tid,uid,text='attached'):
    campaign.handle_event(UserEvent(thread_id=tid,type='text',text=text,upload_ids=[uid]))


def test_photo_only_recovery_preserves_direction_restart_and_explicit_one_render(monkeypatch,tmp_path):
    cid,tid,uid,old,calls=setup_missing(monkeypatch,tmp_path)
    before=campaign._context_of(cid).model_dump(mode='json')
    ws=campaign._ws(tid);board=deepcopy(ws['board']);detail=deepcopy(ws['detail'])
    assets=store.list_assets(thread_id=tid);slot=old[0]['slot']
    _text(tid,'re-roll '+slot+' — brighten the background without changing the product')
    pending=store.load_checkpoint(tid,'_reroll_photo');assert pending['slot']==slot and 'brighten' in pending['note']
    assert not calls
    _text(tid,'yes');assert not calls and store.get_thread(tid)['stage']=='creative'
    assert campaign._ws(tid)['items']==old
    campaign._WORKSPACES.clear()
    upload(tid,uid,'go ahead')
    after=campaign._context_of(cid).model_dump(mode='json')
    assert after['product']['image_upload_ids']==[uid]
    after['product']['image_upload_ids']=[];assert after==before
    assert campaign._ws(tid)['board']==board and campaign._ws(tid)['detail']==detail
    assert campaign._ws(tid)['items']==old and store.list_assets(thread_id=tid)==assets
    assert not calls and store.get_thread(tid)['stage']=='creative'
    latest=_envelopes(tid)[-1]
    assert latest['question']['options'][0]['event']=='resume_photo_reroll'
    assert latest['question']['options'][0]['label']=='Retry this image'
    campaign._WORKSPACES.clear();_text(tid,'yes')
    assert len(calls)==1 and 'brighten the background' in calls[0][0]
    assert 'owned:'+uid in calls[0][1]['image_urls']
    assert campaign._ws(tid)['items'][0]['asset_id']!=old[0]['asset_id']
    assert campaign._ws(tid)['items'][1]==old[1]
    assert all(store.get_asset(a['id'])==a for a in assets)
    assert store.load_checkpoint(tid,'_reroll_photo')=={}
    _act(tid,'resume_image_edit','resume_photo_reroll');assert len(calls)==1


@pytest.mark.parametrize('change',['stage','asset','context'])
def test_stale_photo_recovery_cannot_apply_or_dispatch(monkeypatch,tmp_path,change):
    cid,tid,uid,old,calls=setup_missing(monkeypatch,tmp_path)
    _act(tid,'creative','reroll_'+old[0]['slot'])
    if change=='stage':store.set_thread_stage(tid,'qc')
    elif change=='asset':campaign._ws(tid)['items'][0]['asset_id']='ast_different'
    else:
        context=campaign._context_of(cid);context.campaign.target_audience='different audience'
        store.update_series_context(cid,context.model_dump(mode='json'))
    upload(tid,uid)
    assert not calls and store.load_checkpoint(tid,'_reroll_photo')=={}
    assert campaign._context_of(cid).product.image_upload_ids==[]
    assert 'no longer current' in _envelopes(tid)[-1]['text']


def test_photo_with_new_facts_keeps_normal_conversation_route(monkeypatch,tmp_path):
    cid,tid,uid,old,calls=setup_missing(monkeypatch,tmp_path)
    _act(tid,'creative','reroll_'+old[0]['slot'])
    revisions=[];monkeypatch.setattr(campaign,'_revise_turn',lambda *args:revisions.append(args))
    upload(tid,uid,'Change the target audience to students and use this photo')
    assert revisions==[(tid,cid,'Change the target audience to students and use this photo')]
    assert store.load_checkpoint(tid,'_reroll_photo')=={} and not calls


@pytest.mark.parametrize('unavailable',['foreign','no_storage'])
def test_unavailable_photo_cannot_complete_pending_edit(monkeypatch,tmp_path,unavailable):
    cid,tid,uid,old,calls=setup_missing(monkeypatch,tmp_path)
    _act(tid,'creative','reroll_'+old[0]['slot'])
    if unavailable=='foreign':uid='up_not_owned'
    else:
        store.get_conn().execute('UPDATE uploads SET storage_ref=NULL WHERE id=?',(uid,));store.get_conn().commit()
    upload(tid,uid)
    assert not calls and not store.load_checkpoint(tid,'_reroll_photo')['reference_ready']
    assert campaign._context_of(cid).product.image_upload_ids==[]
    assert 'unavailable to this account' in _envelopes(tid)[-1]['text']


def test_selected_conversational_edit_retains_full_note_when_photo_missing(monkeypatch,tmp_path):
    cid,tid,uid,old,calls=setup_missing(monkeypatch,tmp_path)
    note='Make the background lighter but preserve the original mark'
    _text(tid,note);_text(tid,'the first one')
    pending=store.load_checkpoint(tid,'_reroll_photo')
    assert pending['note']==note and pending['slot']==old[0]['slot']
    upload(tid,uid);_act(tid,'resume_image_edit','resume_photo_reroll')
    assert len(calls)==1 and note in calls[0][0]


def test_direct_retry_missing_photo_saves_the_same_safe_recovery(monkeypatch,tmp_path):
    cid,tid,uid,old,calls=setup_missing(monkeypatch,tmp_path)
    campaign._reroll_turn(tid,old[0]['slot'],'Keep the original product')
    assert store.load_checkpoint(tid,'_reroll_photo')['note']=='Keep the original product'
    assert not calls
