"""Actual driver/owned asset PNG contracts; provider transport replaced, zero calls."""
from PIL import Image
from app import campaign, config, media, store
from app.schemas import ShotBoard
from test_marketing import marketing_env, _board, _shot
from test_fmea_flow import _ruminated


def setup_one(monkeypatch, tmp_path, platforms=None):
    cid,tid=_ruminated('Output-ratio proxy')
    context=campaign._context_of(cid)
    if platforms:
        context.campaign.platforms=platforms
        store.update_series_context(cid,context.model_dump(mode='json'))
    ws=campaign._ws(tid)
    board=ShotBoard.model_validate(_board(shots=[_shot()]))
    ws['board']=board.model_dump(mode='json');ws['detail']=campaign._detail_from_board(board,None)
    ws['brief']={'aspect_ratios':['1:1','4:5']}
    calls=[]
    def render(kind,prompt,**kwargs):
        calls.append(kwargs)
        ratio=kwargs['ratio'];w,h=map(int,ratio.split(':'));path=tmp_path/f'ratio-{len(calls)}.png'
        Image.new('RGB',(100*w,100*h),'navy').save(path)
        return {'path':str(path),'kind':'image','model':'proxy','provider':'proxy','cost':0,'refs_used':kwargs.get('image_urls',[]),'dropped_refs':[]}
    monkeypatch.setattr(campaign,'generate',render)
    return cid,tid,ws,calls


def test_still_keyframe_uses_delivery_ratio_and_same_png_is_reused(monkeypatch,tmp_path):
    cid,tid,ws,calls=setup_one(monkeypatch,tmp_path)
    campaign._keyframes_turn(tid,cid)
    assert [c['ratio'] for c in calls]==['4:5'], 'Brief first aspect is not the IG-feed delivery ratio'
    frame=ws['keyframes']['frames'][0];asset=store.get_asset(frame['asset_id'])
    assert asset['params']['ratio']=='4:5'
    with Image.open(asset['path']) as image:assert image.size==(400,500)
    ws['keyframes']=campaign._approve_all_keyframes(ws['keyframes'])
    campaign._confirm_turn(tid,cid);assert ws['ratios']==['4:5']
    campaign._generate_turn(tid,cid,1,False)
    assert len(calls)==1 and ws['items'][0]['asset_id']==asset['id']
    assert ws['items'][0]['ratio']=='4:5'
    assert campaign._keyframe_ratio(campaign._context_of(cid),ws,{'creative_type':'video'})=='1:1'


def test_stale_square_cannot_masquerade_as_portrait_and_fallback_is_preflighted(monkeypatch,tmp_path):
    cid,tid,ws,calls=setup_one(monkeypatch,tmp_path)
    path=tmp_path/'old-square.png';Image.new('RGB',(400,400),'navy').save(path)
    old=store.add_asset(tid,'keyframe_shot_01','image',str(path),{'ratio':'1:1','model':'proxy'},0)
    ws['keyframes']={'frames':[{'shot_slot':'shot_01','asset_id':old,'approved':True}]}
    campaign._confirm_turn(tid,cid)
    assert campaign._pending_image_outputs(ws,ws['detail'],['4:5'],[None])==1
    monkeypatch.setattr(campaign,'_sample_media',lambda:False)
    monkeypatch.setattr(campaign.usage,'media_capacity',lambda:{'remaining':0,'owner_remaining':0,'shared_remaining':20,'scope':'lifetime'})
    campaign._generate_turn(tid,cid,1,False)
    assert not calls and not ws['items']
    monkeypatch.setattr(campaign.usage,'media_capacity',lambda:{'remaining':1,'owner_remaining':1,'shared_remaining':20,'scope':'lifetime'})
    campaign._generate_turn(tid,cid,1,False)
    assert len(calls)==1 and calls[0]['ratio']=='4:5' and calls[0]['image_urls']
    item=ws['items'][0];assert item['asset_id']!=old and item['ratio']=='4:5'
    with Image.open(store.get_asset(item['asset_id'])['path']) as image:assert image.size==(400,500)
    with Image.open(store.get_asset(old)['path']) as image:assert image.size==(400,400)


def test_multi_placement_still_counts_and_renders_each_distinct_ratio_once(monkeypatch,tmp_path):
    cid,tid,ws,calls=setup_one(monkeypatch,tmp_path,['instagram_feed','linkedin'])
    plan=campaign._media_plan(ws['board'],cid,tid)
    assert plan['keyframe_operations']==1 and plan['additional_image_operations']==1 and plan['minimum_operations']==2
    campaign._keyframes_turn(tid,cid);ws['keyframes']=campaign._approve_all_keyframes(ws['keyframes'])
    campaign._confirm_turn(tid,cid)
    assert campaign._pending_image_outputs(ws,ws['detail'],ws['ratios'],[None])==1
    campaign._generate_turn(tid,cid,1,False)
    assert [c['ratio'] for c in calls]==['4:5','1:1']
    assert [i['ratio'] for i in ws['items']]==['4:5','1:1']
    assert campaign._media_plan(ws['board'],cid,tid)['minimum_operations']==0


def test_mock_feed_image_has_declared_four_by_five_dimensions(tmp_path):
    path=tmp_path/'mock.svg';media._mock_image('fixture','4:5',path)
    assert 'width="720" height="900"' in path.read_text()


def test_wrong_pixels_with_correct_metadata_never_pass_reuse_approval_or_qc(monkeypatch,tmp_path):
    from app.schemas import QCReport, UserEvent
    from test_marketing import _envelopes
    cid,tid,ws,calls=setup_one(monkeypatch,tmp_path)
    path=tmp_path/'wrong-provider-pixels.png';Image.new('RGB',(400,400),'navy').save(path)
    aid=store.add_asset(tid,'keyframe_shot_01','image',str(path),{'ratio':'4:5','model':'proxy'},0)
    ws['keyframes']={'frames':[{'shot_slot':'shot_01','asset_id':aid,'approved':True}]}
    ws['ratios']=['4:5']
    campaign._generate_turn(tid,cid,1,False)
    assert not calls and not ws['items'] and store.get_asset(aid)
    assert _envelopes(tid)[-1]['artifacts'][0]['title']=='Image dimensions need review'
    ws['keyframes']['frames'][0]['approved']=False;store.set_thread_stage(tid,'keyframes')
    campaign.handle_event(UserEvent(thread_id=tid,type='action',action={'artifact_id':'keyframes','event':'approve_keyframes'}))
    assert not ws['keyframes']['frames'][0]['approved'] and not calls
    ws['items']=[{'slot':'shot_01_4x5','asset_id':aid,'kind':'image','ratio':'4:5'}];ws['accepted']={'shot_01_4x5'}
    campaign._qc_turn(tid,cid)
    assert ws['qc']['verdict']=='held' and ws['qc']['automated']['image_aspect_ratio']=='fail'
    ws['qc']=QCReport().model_dump(mode='json')
    assert not campaign._require_qc_clear(tid,ws), 'Old cleared QC cannot bypass the current bytes check'
    assert not store.list_ad_cards(cid) and not calls


def test_invalid_new_keyframe_keeps_checkpoint_and_retry_does_not_regenerate(monkeypatch,tmp_path):
    cid,tid,ws,calls=setup_one(monkeypatch,tmp_path)
    def wrong(kind,prompt,**kwargs):
        calls.append(kwargs);path=tmp_path/'bad-paid-frame.png';path.write_bytes(b'not a decodable image')
        return {'path':str(path),'kind':'image','model':'proxy','provider':'proxy','cost':0,'refs_used':[],'dropped_refs':[]}
    monkeypatch.setattr(campaign,'generate',wrong)
    campaign._keyframes_turn(tid,cid)
    assert len(calls)==1 and len(store.list_assets(thread_id=tid))==1
    assert store.load_checkpoint(tid,'_keyframe_outputs')['outputs']['shot_01']['asset_id']
    campaign._keyframes_turn(tid,cid)
    assert len(calls)==1 and not ws.get('keyframes'), 'Retain invalid paid bytes for explicit review, never silently regenerate'


def test_ratio_allows_small_quantization_only_and_no_undecodable_asset(monkeypatch,tmp_path):
    import pytest
    cid,tid,ws,calls=setup_one(monkeypatch,tmp_path)
    path=tmp_path/'quantized.png';Image.new('RGB',(896,1152),'navy').save(path)
    aid=store.add_asset(tid,'quantized','image',str(path),{'ratio':'4:5'},0)
    campaign._verify_image_ratio(store.get_asset(aid),'4:5')
    with pytest.raises(campaign.ImageRatioMismatch):campaign._verify_image_ratio(store.get_asset(aid),'1:1')
