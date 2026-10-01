# Plotline — launch handoff
last-synced: `62553e8`

## Current state — 2026-10-01
The portfolio launch brief supersedes the earlier local-only hosting/auth/palette rules.
App6 is live at https://plotline.3-6-183-210.sslip.io in ordinary authenticated live mode.
Free HTTP/storage, corrected root-entry browser and one real PixelBin image reroll acceptance pass.
Original Render services and unrelated retrieval/Supabase infrastructure remain untouched.

## Full-flow repair — 2026-10-01, local acceptance complete; live QA pending
The user has now authorized full paid end-to-end QA and deployment; the root operator alone performs live actions. This supersedes the earlier single-image/local-only approval limit for this repair. The earlier launch evidence below remains historical, not proof of this full flow.

Start now asks only for a product photo and one-line campaign prompt. Missing goal/audience/placement is requested in chat; an absent brand is valid. Plain “yes”/“go ahead” advances only a ready intake or the current review gate. A literal “regenerate and use brand - Anand” updates only the name, retains claims/product/campaign facts, and opens a new brief for approval. Earlier paid assets and messages stay in history; a durable reset marker prevents old approvals returning after restart.

Owned product-photo pixels reach bounded vision intake; exact-version signed references condition product anchors and creative edits. Product canon reuse additionally requires the same product upload IDs. A different product receives a deterministic separate canon ID; its board binding is saved with the canon artifact and survives restart without overwriting the earlier library row. Older live campaigns without an available owned photo are asked to attach one before any new render. A single-image visual edit rerolls one slot; informational questions do not buy media, and exact status commands cannot mistake “olive” for “live”. New brand names never authorize product claims.

Web changes are coordinated separately: photo/prompt start, only the current question's actions, persistent validation errors, working-state fences, natural feedback with panel focus, and working Copy/Download controls in read-only artifact detail.

Final provider-denied native and isolated PostgreSQL suite: 263 passed / 4 skips (ffmpeg is unavailable locally). Full configured testpaths include rag/tests. Seven added regressions cover exact photo/prompt → clarification → ordinary approval → brand revision → four mocked media renders → delivery; unrelated-question zero dispatch; name-only field preservation; bounded owned vision pixels; substring-safe edits; and legacy missing/foreign-reference refusal. Existing auth/RLS/budget/storage tests pass. Evidence: portfolio/_verify/plotline/fullflow-fix-python-canon-final.log. No paid provider call was made by this workstream. Root browser, actual PixelBin/LLM progression, reload and final ZIP evidence remain pending.

## Live intake packaging correction — pending corrected image acceptance
The first attempted live photo intake failed before provider dispatch: Pillow was constrained but not installed by Docker. Read-only exact-image diagnosis found `PIL` absent; no usage/asset row was created. The direct requirement is now pinned to Pillow12.3.0. Caught stage failures record failed/stage_failed, and current error envelopes expose an explicit Retry question. Local full suite passes265 with four ffmpeg skips; root must verify uploaded-image decoding in the rebuilt Linux image before an explicit retry. The root preserves the failed thread/evidence and alone performs deployment/provider actions.

## Tool continuation and delivery gate correction — local acceptance
OpenAI SDK3.22.1 serialized response tool items back into the next request with the invalid Python field name `async_` and optional null fields. A strict mocked HTTP transport reproduced rejection with the actual SDK for both absent async and explicit async:false; alias-aware serialization excluding nulls passes both two-turn cases. The historical live rejection discarded its provider field, so this is a confirmed wire defect and a strong match, not proof of the exact historical rejected parameter. Rejections now retain only bounded allowlisted status/code/parameter metadata in the existing owner agent log; provider messages, URLs and secrets are excluded. No automatic retry was added.

Delivery now independently requires a validated cleared QC report for typed approval, direct action dispatch and assembly/recovery. Missing/held reports and false cleared labels containing blocking findings cannot create an AdCard. A visible current question states delivery is held. Actual driver regressions cover all paths, and ordinary yes still delivers a cleared report. Full network-denied suite:272 passed, four local ffmpeg skips, including isolated PostgreSQL. Runtime files are frozen for root review/deployment; no new provider request was made by this workstream. Evidence: portfolio/_verify/plotline/provider-qc-final-tests.log.

## Live retrieval provenance correction — local acceptance
The bundled devrag service serves labelled sample records, not a production evidence corpus. Ordinary live searches now discard response-level or per-hit sample_data markers; its resolver carries the same marker and live citation checks reject those IDs. Explicit MOCK_LLM or verified cached execution retains prepared fixtures; fixture identity alone does not permit sample evidence for live work. Actual devrag transport regressions cover all four corpus kinds, zero live niche count, rejection of sample citations, cached/mock preservation and retention of unmarked real hits. Full network-denied native/isolated-PG suite276 passed, four local ffmpeg skips. Live options must disclose evidence gaps; this patch does not create a real corpus. Root deployment/paid QA remains separate.

## Live envelope and recovery correction — local acceptance
The paid shot-board result succeeded, but its envelope added a one-sentence heading to a two-sentence live billing note and violated the message schema. The shared billing note is now one truthful sentence. A full driver regression runs actual MOCK_MEDIA=false billing branches with fixture media transport, through photo, clarification, brand change, board/canon/keyframe, one creative edit, QC, reload and delivery. LLM responses remain deterministic fixtures; this is not paid provider evidence.

Validated board output is now checkpointed before display and reused only on explicit Retry when the complete context, model, system prompt, style and input fingerprint match. Changed briefs regenerate; nonowner PostgreSQL contracts deny foreign checkpoint reads/upserts. The earlier live failed board has no such checkpoint and is not backfilled from logs: root explicitly authorizes one normal regeneration. QC artifacts now retain accepted slot/asset identities; rehydrate accepts only exact current matches and cannot approve substituted assets. The options headline now reports actual supporting-source coverage instead of always claiming evidence is attached. Full suite282 passed / four local ffmpeg skips; runtime frozen pending root deployment and paid acceptance.

## Workflow preserved
Conversation fragments → brief → options → templates → script (video) → board → canon → keyframes → generate → creative → QC → delivery.
Rendering actions remain in the conversation; existing detail controls remain available.
Missing campaign details are asked in chat. Only explicit delegation such as “you decide” permits labelled business defaults; unconfirmed claims remain unconfirmed.
Prepared ceramic-mug examples use this workflow and retain permanent cached mode even after editing.

## Auth and data
Next Auth.js Credentials/bcrypt12 uses durable revocable PostgreSQL sessions and signed CSRF.
Same-origin Next BFF signs method/path/body/owner/session/nonces; private FastAPI rechecks sessions.
Fresh PostgreSQL uses19 forced-RLS tables; a non-login migration owner holds DDL, runtime has DML only.
All state/files/jobs/logs are owner-scoped. Canon names are unique per owner, and canon assets survive campaign deletion.
Jobs preserve explicit actor context,2 per owner/4 global. Restart recovery requires an explicit Retry of a validated saved job.
Private S3 assets keep exact version/SHA metadata; API hydration and ZIP reads revalidate ownership.
Local SQLite is only an explicit fixture. Production cannot silently use local DB/storage fallback.
Manual prompt overrides remain process-local and must be reapplied after API restart.

## Providers and costs
Ordinary text defaults to OpenAI Responses gpt-5.4-mini; explicit Anthropic remains available.
Every dispatch reserves budget; text caps default$1 per owner/$5 shared. SDK retries are disabled.
Media uses6 owner/20 shared operation allowances; unknown USD conversion stays unknown.
Returned provider credits are retained; legacy fal-era USD numbers are not PixelBin invoices.
Prepared output says Sample/no provider charge; model labels identify the configured provider-qualified route.
The sole authorized image reroll returned1 PixelBin credit; actual USD remains null (`usage_unavailable`).
Proof covers one image only; text/canon/keyframe preparation was mocked, with no paid LLM/video/full-QC claim.

## Verification and remaining gates
Full native baseline204 passed/4 existing retrieval skips; corrected fragmented-intake baseline208 passed/4 skips.
Integrated suite256 passed/4 existing retrieval skips, including real non-owner PostgreSQL, replay/revocation, canon retention, quotas and cached restart recovery.
Compiled Auth.js/BFF checks37 and local prepared journey55 passed. AWS prepared journey61 checks/101requests passed; usage stayed0 during that free acceptance phase.
All6 S3 assets match exact versions/SHA/bytes. Cold file recovery returned B404/A200 and restored the same787 bytes/SHA; unsigned exact-version access403.
Ten client tests, R4 production build and compiled root HTTP307 regression pass. The redirect avoids revealing a delayed root RSC redirect after sign-in.
Root signed-out bare-URL redirect/sign-in/reload retest passes with no fresh warnings/errors; original React310 failure receipt retained.
External evidence lives in portfolio/_verify/plotline; private credentials are outsidegit.
Paid audit:1 media row/0 text rows; PNG896×1152 (requested4:5),1,587,128bytes; all8 S3 asset versions/SHA verified, prior7 unchanged and B404.
Ordinary runtime is verified live/live, exact API249e/web101a, non-root/read-only, no proof overlays; existing services unchanged.
Release scope is the reviewed canonical source plus README-only legacy split notices and exact historical scan metadata.
No commit/push until root reviews the exact candidate. Loop.MD status remains unchanged; no paid golden evals authorized.


## Intake choice correction — 2026-10-01, source ready; live acceptance pending
The corrected Linux image decoded the product photo successfully. Its first successful intake nevertheless returned labelled business assumptions without user delegation. The old driver permitted both count-triggered defaults and new assumptions in ordinary model output. Both are now closed: message count has no effect, normal intake sets assume_mode=false and validates against unsolicited assumptions, and only an explicit “you decide” style request enters assume mode. A product must already be supplied before delegation; no product facts or claims are invented. Retry is not an answer to a clarification. Existing live assumptions are preserved until the root corrects them via the ordinary conversation, rather than silently rewriting the saved campaign.

Full provider-denied suite:267 passed, four local ffmpeg skips, including the actual failed-photo → Retry → missing-goal/platform question regression and isolated PostgreSQL. Root-owned live continuation is pending; no image generation has been verified in this full-flow run yet.


## Product-mark prompt correction — local acceptance
The generated neutral style now forbids added logos while preserving markings already on the referenced product. Before keyframe or generated creative rendering, only the exact known legacy neutral style plus its exact generated prefix is normalized; custom styles, user-authored prompts and missing provenance remain unchanged. Effective keyframe prompts are retained in asset metadata and generation logs; historical board text is not rewritten. Five outgoing-prompt regressions cover new, legacy and untouched custom cases. Full network-denied native/isolated-PG suite287 passed, four local ffmpeg skips. Root-owned live media acceptance remains pending; this change makes no provider call.


## First canon media rejection — diagnostic boundary
The real canon plan completed, but the first PixelBin submission was explicitly rejected before a job ID was returned. The old path discarded status and field details, so its exact cause is unknown. A read-only current authenticated schema, published SDK comparison, actual offline multipart capture and owned-reference GET/hash/MIME all pass; no speculative request-format rewrite was made. Rejections now log only bounded status/code/parameter categories, never provider prose or signed URLs. The rejected usage row remains retained with unknown USD.

PLOTLINE_OWNER_MEDIA_LIMIT now defaults to6 and accepts only integers1–20; shared20 remains fixed. Root may temporarily set8 for this QA continuation and must restore the original setting afterward. Real PostgreSQL tests prove6→8→6 preserves every usage row and invalid settings reserve nothing. Full suite290 passed/four local ffmpeg skips. This workstream made no generation request; root alone controls any explicit instrumented retry.


## Reference-array transport correction — source frozen, live retry pending
Retained CloudWatch evidence now identifies the instrumented rejection as HTTP400 / JR-0400 / /input/images. URL references now use the official Python SDK contract: application/json with dotted input keys and actual arrays, including a single URL. The previously proven no-reference multipart path stays unchanged; there is no encoding fallback or retry. An independent execution of the official SDK pipeline and actual HTTPX wire tests agree for signed-style URLs. This addresses the rejected field without claiming the provider has accepted the corrected request yet.

Safe rejection categories are also saved in the existing owner-scoped activity log, so container replacement does not remove the campaign diagnosis. Real PostgreSQL tests verify owner isolation and unchanged unknown-USD settlement. Full suite293 passed/four local ffmpeg skips. Root owns deployment, any temporary allowance and the next explicit live attempt; no provider request was made by this workstream.
