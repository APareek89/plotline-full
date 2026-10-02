"""Reproduce the evidence inventory from reviewed scenario definitions, not bug counts."""
from pathlib import Path
import ast,csv,json,hashlib
ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
# Each line is a distinct trigger/effect scenario; symbols name actual inspected controls.
GROUPS={
'unhandled_error_paths': '''Malformed intake JSON leaves the user without a current clarification|test_intake_survives_a_turn_it_cannot_parse
Missing workspace dependencies reach a paid agent as empty objects|test_a_stage_refuses_to_run_without_the_state_it_depends_on
Caught stage exception is recorded as a successful background job|test_caught_stage_failure_is_persisted_failed_and_next_job_can_finish
Provider refusal is rendered as a successful structured answer|test_session_invalid_provider_proxy_never_yields_a_success
Generic failure hides actionable reason and loses safe diagnostic correlation|test_safe_failure_diagnostics_are_correlated_and_do_not_persist_provider_body
Board envelope fails after successful planning and charges another identical planner call|test_board_emission_failure_retries_only_matching_persisted_output
A canon sheet fails after its anchor and Retry pays for the anchor again|test_partial_canon_retry_reuses_completed_anchor_after_restart
Sharper rendering fails after deleting the only reusable library row|test_sharper_failure_keeps_old_library_and_board_bindings
Unknown creative-stage question starts a paid reroll instead of clarifying|test_visual_feedback_does_not_match_status_or_question_substrings''',
'external_dependency_failures': '''Accepted media job loses its poll response and gets submitted twice|test_accepted_poll_failure_never_resubmits
Policy refusal falls through to another paid provider|test_terminal_policy_no_fallback
Provider HTTP 500 is automatically replayed despite uncertain acceptance|test_http500_and_transport_do_not_retry_or_release
Malformed provider job identifier forms an authenticated attacker-selected poll path|test_malformed_job_id_never_forms_authenticated_poll
Provider-returned URL redirects a credential-bearing request|test_fal_credentials_ignore_returned_urls
PixelBin reference JSON loses singleton or multiple image URL arrays|test_pixelbin_url_reference_json_matches_published_python_sdk
Reference validation rejection triggers hidden alternate-encoding submission|test_reference_rejection_never_retries_with_another_encoding
S3 cold hydration returns bytes from a different version or hash|test_version_hash_and_cold_hydrate
A paid render download fails and the successful provider receipt disappears|test_a_paid_render_whose_download_fails_is_still_recorded''',
'race_conditions_and_state': '''Two owners share connection identity under concurrent requests|test_concurrent_scopes_never_reuse_connection_identity
Session is revoked between reserve and dispatch but request still leaves|test_usage_revocation_before_dispatch_releases_capacity
Background worker loses captured actor or leaves active-job capacity occupied|test_background_jobs_preserve_actors_and_release_setup_failure
Restart after brief restores its projection but loses actual board|test_the_board_survives_a_restart_not_just_its_projection
Earlier option approvals reactivate after business identity revision|test_brand_revision_preserves_paid_history_and_invalidates_old_approvals
New rumination inherits paid checkpoints belonging to older inputs|test_a_new_rumination_clears_stale_checkpoints
Cleared QC survives a replacement image by slot name alone|test_rehydrated_qc_does_not_accept_replaced_asset
Canon question re-emits old stage actions after workflow advances|test_clarification_cannot_reactivate_a_previous_canon_gate
Partial keyframe success is lost across process restart|test_keyframe_partial_retry_only_renders_missing_shot_and_invalidates_changed_input''',
'resource_exhaustion': '''Three two-render canon kinds consume default allowance before two keyframes|test_multi_reference_board_preflights_all_remaining_work_without_dispatch
Configured owner media allowance differs from the hard-coded usage API value|test_media_headroom_is_lifetime_count_and_readonly
Invalid override grants unlimited media operations|test_invalid_media_limit_rejects_before_reservation
Prompt bytes exceed provider input admission bound|test_bound_blocks_before_dispatch
A legitimate vision payload is charged or rejected using the text-only byte cap|test_actual_sdk_large_image_separate_from_text_bound
Slow trickle response keeps a provider request alive indefinitely|test_slow_trickle_transport_hits_wall_deadline_once_and_keeps_uncertain
Oversized owner state overwrites existing durable data before capacity failure|test_quota_rejects_oversized_state_without_replacing_saved_data
Seat configuration fans out unbounded reviewers|test_the_seat_cap_holds_and_an_unknown_seat_is_refused
Same-input partial results are counted as new required operations and falsely block affordable completion|test_capacity_discounts_same_input_anchor_and_keyframe_checkpoints''',
'security_access_control': '''Foreign owner reads or overwrites a campaign checkpoint|test_pg_forced_owner_rows_foreign_upserts_and_missing_actor
Foreign owner changes another reservation after provider completion|test_usage_preserves_settlement_and_foreign_owner_cannot_change_it
Private asset path follows symlink outside owner directory|test_private_files_reject_symlinks_and_foreign_owner
Foreign owner triggers an S3 fetch before ownership rejection|test_foreign_owner_denied_before_s3
Signed bridge request body or path is replayed or altered|test_signed_bridge_binds_body_path_nonce_and_revocable_session
Cached example scope signs a paid-provider private reference URL|test_cached_signing_denied_and_ttl
Changed bytes under the recorded object version pass hash readback|test_tampered_version_readback_rejected
Signed reference omits owner/version/expiry binding|test_reference_scope_requires_current_owner_version_signature_and_short_ttl
Database URL parameters disable Python verified TLS|test_python_database_url_cannot_override_verified_tls''',
'data_integrity_partial_writes': '''Successful canon plan is discarded before its first failed media step|test_canon_plan_checkpoint_retry_keeps_ids_and_does_not_pay_planner_twice
New product reuses a human canon slug and overwrites the previous product row|test_different_product_canon_preserves_library_and_restart_bindings
Environment correction partially succeeds and replaces current binding early|test_targeted_environment_edit_preserves_history_and_restart_binding
Intake forgets an uploaded product photo on later user messages|test_an_attached_image_survives_until_there_is_a_product_to_put_it_on
Campaign deletion destroys reusable canon or paid asset history|test_canon_names_are_owner_scoped_and_assets_survive_campaign_delete
Incomplete planner result is restored as a completed checkpoint|test_only_a_complete_result_is_ever_restored
Renamed board after intake reset loses access to same-thread paid references|test_historical_paid_canon_recoverable_after_intake_reset_and_renamed_board
Explicit saved-reference choice silently restores old approval|test_saved_reference_rebinding_is_explicit_and_survives_reload
Duplicate or cross-kind canon IDs satisfy set comparison while binding the wrong references|test_canon_plan_rejects_duplicate_ids_and_reference_kind_confusion''',
'observability_gaps': '''Current provider mapping differs from model confirmation shown to user|test_planned_model_uses_actual_primary_mapping
Raw signed reference URLs leak into persisted parameters or logs|test_pixelbin_params_and_logs_do_not_retain_signed_references
PixelBin rejection category disappears when the container restarts|test_pixelbin_rejection_survives_in_owner_activity_without_sensitive_body
Provider rejection diagnostics include secret-bearing raw error messages|test_http_rejection_persists_only_safe_protocol_metadata
Unwired visual detectors are reported as passing|test_an_unwired_detector_reports_skip_and_never_pass
Options headline promises evidence when no sources exist|test_options_headline_matches_actual_attached_sources
Render reports requested references instead of the subset actually sent|test_a_render_sends_the_references_the_model_declares_and_names_the_rest
Shot validator claims it automatically split a clip without changing rows|test_b1_reports_two_action_beat_without_claiming_an_unperformed_split
Request progress text displays work from another thread|test_progress_labels_follow_the_thread_that_is_running''',
'scale_and_load_failures': '''A sequential request exceeding the owner budget mutates usage before rejection|test_pre_dispatch_caps_reject_without_mutating_usage
A single provider HTTP 503 is not retained as uncertain usage|test_5xx_remains_uncertain
Compressed provider response expands beyond bounded parser memory|test_provider_compression_rejected_before_decode_retains_uncertain
Provider redirects exhaust background sockets|src:api/app/safe_network.py
More than 4000 active workspaces exhaust process memory|src:api/app/campaign.py
Many owners saturate real S3 or database throughput|unverified:api/app/database.py
Uploaded decompression-bomb image exhausts worker memory|src:api/app/campaign.py
Concurrent requests race quota preflight snapshot|src:api/app/usage.py
Long model tool chains exceed configured turn or overall time budget|src:api/app/agents/providers.py''',
'billing_credit_mismatches': '''Unknown PixelBin dollar conversion is displayed as known zero-cost usage|test_media_operation_limit_is_separate_from_unknown_usd
Known usage is lost when response is truncated|test_usage_settled_before_incomplete_output
Known policy refusal usage is released instead of retained|test_policy_refusal_settles_usage_and_stops
Explicit HTTP rejection is charged as an unknown accepted request|test_rejection_zero_settlement_and_no_retry
Web-search usage is not counted or budgeted|test_actual_searches_recorded_and_priced
Model-confirm price is an unsupported user-supplied number|test_the_board_never_invents_a_model_id_or_a_price
Creative variants charge reused body scenes again|test_the_variant_matrix_shows_what_was_reused_not_re_rendered
Shared lifetime media pool is exhausted even when an owner has room|src:api/app/usage.py
Production billing total differs from proxy-fixture counts or estimates|unverified:api/app/usage.py''',
'retry_idempotency_issues': '''Unknown network completion is automatically submitted again|test_a_dropped_connection_preserves_log_without_duplicate_paid_dispatch
Known API status rejection is treated as a retriable transport blip|test_an_api_status_error_is_not_retried_as_a_blip
Paid rumination stage is repeated after a later stage failure|test_a_completed_stage_is_never_paid_for_twice
Explicit failure recovery disappears after workspace restart|test_cached_failed_job_recovers_explicitly_after_workspace_restart
Second refinement silently repeats the same bounded paid council pass|test_refine_cannot_run_twice_even_if_options_stay_flagged
Repair retry repeats the same unsuccessful variable change|test_two_retries_cannot_change_the_same_variable
SDK tool continuation serializes unsupported response aliases|test_function_roundtrip_uses_same_graph_tools
A missing checkpoint reuses a legacy anchor from a different configured model|src:api/app/campaign.py
Process dies after provider success but before local asset checkpoint commit|unverified:api/app/campaign.py''',
'config_feature_flag_drift': '''Local preview flag permits canonical provider credentials or public origin|test_loopback_preview_never_accepts_public_or_live_configuration
Real mode silently uses fixture fallback when credentials are absent|test_real_mode_without_a_key_is_refused_up_front_not_discovered_mid_run
Cached execution reaches a live SDK despite fixture provenance|test_cached_scope_blocks_live_sdk
Review policy skips paid approval gates|test_a_cost_gate_cannot_be_configured_away
Review policy skips mandatory keyframe or QC checks|test_qc_and_keyframes_can_never_be_skipped
Provider model configuration omits reference capability limits|test_every_model_route_declares_a_reference_budget
New language-model stage lacks a configured model slot|test_every_llm_stage_has_a_model_slot
Database URL ssl=no-verify overrides Node explicit CA configuration|node:web/tests/database-tls.test.mjs
Review metadata still describes local SQLite and no auth or billing|src:api/.power-coding/config.json''',
'edge_cases_from_prd': '''Single still with a person is rejected by video screen-time rules|test_single_still_with_person_does_not_require_video_screen_time
A user-requested two-image carousel is silently collapsed|test_session_board_actual_runner_preserves_requested_still_count
Photo and one-line prompt trigger invented business defaults after Retry|test_photo_retry_never_delegates_missing_campaign_choices
Fragmented intake forces form fields instead of asking in chat|test_session_intake_single_person_product_full_driver_to_delivery
Brand-name correction changes unrelated supplied facts or paid history|test_brand_revision_preserves_paid_history_and_invalidates_old_approvals
Real identifiable person renders before rights verification|test_canon_unverified_person_is_refused_before_any_render
A confirmed claim is replaced by a model-invented performance benefit|test_unmapped_claim_never_reaches_the_campaign_detail
Direct deliver action bypasses blocking QC findings|test_qc_delivery_cannot_be_bypassed_by_text_direct_event_or_recovery
Paid visual output fails to preserve product markings or removes requested objects|unverified:api/app/campaign.py'''
}
# These are demonstrated changes, not every scenario in this report.
FIXED={
 'test_partial_canon_retry_reuses_completed_anchor_after_restart','test_sharper_failure_keeps_old_library_and_board_bindings',
 'test_keyframe_partial_retry_only_renders_missing_shot_and_invalidates_changed_input','test_multi_reference_board_preflights_all_remaining_work_without_dispatch',
 'test_media_headroom_is_lifetime_count_and_readonly','test_capacity_discounts_same_input_anchor_and_keyframe_checkpoints',
 'test_canon_plan_checkpoint_retry_keeps_ids_and_does_not_pay_planner_twice','test_historical_paid_canon_recoverable_after_intake_reset_and_renamed_board',
 'test_saved_reference_rebinding_is_explicit_and_survives_reload','test_canon_plan_rejects_duplicate_ids_and_reference_kind_confusion',
 'test_b1_reports_two_action_beat_without_claiming_an_unperformed_split','test_single_still_with_person_does_not_require_video_screen_time',
 'test_canon_unverified_person_is_refused_before_any_render','test_safe_failure_diagnostics_are_correlated_and_do_not_persist_provider_body',
 'src:api/.power-coding/config.json'}
# Severity/occurrence/detection are reasoned ordinal judgments, not measured rates.
BASE={'unhandled_error_paths':(7,5,5),'external_dependency_failures':(8,4,4),'race_conditions_and_state':(8,4,6),'resource_exhaustion':(8,6,5),'security_access_control':(10,3,7),'data_integrity_partial_writes':(9,5,6),'observability_gaps':(6,6,6),'scale_and_load_failures':(8,4,7),'billing_credit_mismatches':(9,5,6),'retry_idempotency_issues':(9,5,6),'config_feature_flag_drift':(8,4,5),'edge_cases_from_prd':(7,5,5)}
tests={}
for path in (ROOT/'api/tests').glob('test_*.py'):
    for node in ast.walk(ast.parse(path.read_text())):
        if isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef)) and node.name.startswith('test_'):
            tests[node.name]=(str(path.relative_to(ROOT)),node.lineno)
rows=[]
for category,lines in GROUPS.items():
    for line in lines.splitlines():
        scenario,key=line.split('|');S,O,D=BASE[category]
        fixed=key in FIXED
        if key.startswith(('src:','node:','unverified:')):
            mode,path=key.split(':',1);assert (ROOT/path).exists(),path
            status='unverified' if mode=='unverified' else 'fixed' if fixed else 'passing' if mode=='node' else 'checked'
            evidence=[{'path':path,'kind':'static inspection' if mode=='src' else 'not executed at production scale/provider' if mode=='unverified' else 'installed-pg offline initialization regression'}]
        else:
            assert key in tests,key
            path,number=tests[key];status='fixed' if fixed else 'passing'
            evidence=[{'path':path,'line':number,'symbol':key,'kind':'guarded test'}]
        action=('Validate in the final guarded suite and keep the regression; deployment is pending.' if fixed else
                'Retain this automated contract; a pass proves the exercised fixture boundary, not live provider behavior.' if status=='passing' else
                'Run only after explicit approval with a bounded acceptance plan; no paid or load claim is made here.' if status=='unverified' else
                'Code path inspected; retain the stated control and add targeted runtime evidence when that risk is in scope.')
        rows.append({'id':f'PL-FMEA-{len(rows)+1:03}','category':category,'failure_scenario':scenario,
          'classification':'demonstrated_issue' if fixed else 'risk_scenario','status':status,
          'severity':S,'occurrence':O,'detection':D,'rpn':S*O*D,
          'priority':'P0' if S*O*D>=200 else 'P1' if S*O*D>=100 else 'P2',
          'evidence':evidence,'recommended_action':action})
rows.append({'id':'PL-FMEA-109','category':'resource_exhaustion',
 'failure_scenario':'Shared AWS Docker build volume fills up and prevents a release image from being created',
 'classification':'demonstrated_issue','status':'mitigated','severity':6,'occurrence':6,'detection':4,'rpn':144,'priority':'P1',
 'evidence':[{'path':'docs/qa/2026-10-02/release-build-storage.json','kind':'observed remote build failure and targeted cleanup receipts'}],
 'recommended_action':'Targeted removal of stopped failed builders and unreferenced untagged build images restored over 4 GB available while retaining running containers and production rollback images. Check build space before future builds; scheduled cleanup is not implemented.'})
for number,category,scenario,test_name,sod in [
 (110,'data_integrity_partial_writes','Still keyframe uses brief first ratio while delivery uses another placement and relabels saved pixels','test_still_keyframe_uses_delivery_ratio_and_same_png_is_reused',(8,6,7)),
 (111,'billing_credit_mismatches','Multiple placement ratios or stale-frame fallback require extra image calls omitted from remaining capacity','test_multi_placement_still_counts_and_renders_each_distinct_ratio_once',(8,5,6)),
 (112,'data_integrity_partial_writes','Wrong or undecodable pixels with correct ratio metadata pass approval, reuse and delivery QC','test_wrong_pixels_with_correct_metadata_never_pass_reuse_approval_or_qc',(8,5,8)),
 (113,'config_feature_flag_drift','Mock image defaults to portrait dimensions for a declared 4:5 output and conceals ratio defects','test_mock_feed_image_has_declared_four_by_five_dimensions',(5,6,6))]:
    path,line=tests[test_name];S,O,D=sod
    rows.append({'id':f'PL-FMEA-{number:03}','category':category,'failure_scenario':scenario,
      'classification':'demonstrated_issue','status':'fixed','severity':S,'occurrence':O,'detection':D,
      'rpn':S*O*D,'priority':'P0' if S*O*D>=200 else 'P1',
      'evidence':[{'path':path,'line':line,'symbol':test_name,'kind':'guarded actual-driver PNG or SVG contract'}],
      'recommended_action':'Retain the regression, deploy the correction after root review, and verify any new paid image separately; proxy pixels are not provider validation.'})
rows.append({'id':'PL-FMEA-114','category':'edge_cases_from_prd',
 'failure_scenario':'A 701px tablet retains split panes, cramping the conversation composer and sign-out controls',
 'classification':'demonstrated_issue','status':'fixed','severity':5,'occurrence':7,'detection':3,'rpn':105,'priority':'P1',
 'evidence':[{'path':'docs/qa/2026-10-02/browser-qa.json','kind':'root browser tablet_followup dimensions at701px'},
             {'path':'docs/qa/2026-10-02/screenshots/plotline-tablet-before.png','kind':'observed cramped tablet layout'},
             {'path':'docs/qa/2026-10-02/screenshots/plotline-tablet-after.png','kind':'stacked layout without document overflow'}],
 'recommended_action':'Retain the960px stacking boundary and nonwrapping sign-out control; final web deployment is root-owned.'})
recovery_test='test_failed_job_recovery_coexists_with_current_saved_reference_question'
recovery_path,recovery_line=tests[recovery_test]
rows.append({'id':'PL-FMEA-115','category':'retry_idempotency_issues',
 'failure_scenario':'A failed-job recovery banner hides newer saved-reference or smaller-plan choices and leaves only generic Retry',
 'classification':'demonstrated_issue','status':'fixed','severity':7,'occurrence':6,'detection':6,'rpn':252,'priority':'P0',
 'evidence':[{'path':recovery_path,'line':recovery_line,'symbol':recovery_test,'kind':'actual stored failed job and GET response; explicit saved-reference action and restart'},
             {'path':'web/app/studio/thread/[threadId]/page.tsx','kind':'current non-Retry action choices take precedence over the generic recovery banner'},
             {'path':'docs/qa/2026-10-02/recovery-priority.json','kind':'isolated synthetic failed-job fixture and root browser acceptance'}],
 'recommended_action':'Show current non-Retry recovery choices while retaining the failed job and historical usage; keep the generic Retry banner for legacy Retry-only or free-text asks. No provider dispatch is needed to review saved references.'})
assert len(rows)>=100 and len(set(r['failure_scenario'] for r in rows))==len(rows)
report={'date':'2026-10-02','scope':'Plotline; free code/API/browser QA plus provider-free release operations; no paid model calls',
 'base_commit':'3cec470','count':len(rows),'categories':len(GROUPS),
 'scoring':'S/O/D use 1–10 expert ordinal estimates (not measured occurrence rates); high detection score means difficult to detect. RPN=S×O×D ranks pre-control review risk. A P0 risk scenario is not a claim of a P0 vulnerability. Status is evidence-specific, not production certification.',
 'status_definitions':{'mitigated':'observed operational failure relieved with recorded controls; permanent automation not claimed','fixed':'demonstrated issue changed locally with cited regression or factual metadata correction; deployment pending','passing':'cited automated contract passes locally under denied provider transport; not external model validation','checked':'source control inspected; scenario not independently exercised here','unverified':'requires real provider, scale, or destructive fault injection not authorized in this free review'},
 'cases':rows}
(OUT/'fmea.json').write_text(json.dumps(report,indent=2)+'\n')
with (OUT/'fmea.csv').open('w',newline='') as file:
    writer=csv.DictWriter(file,fieldnames=[*rows[0].keys()],lineterminator="\n");writer.writeheader()
    for row in rows:writer.writerow({**row,'evidence':json.dumps(row['evidence'],separators=(',',':'))})
print(json.dumps({'scenarios':len(rows),'categories':len(GROUPS),'statuses':{k:sum(r['status']==k for r in rows) for k in ('fixed','passing','checked','unverified','mitigated')}}))
