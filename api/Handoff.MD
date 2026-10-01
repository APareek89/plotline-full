# Plotline — launch handoff
last-synced: `61800c1`

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

## Workflow preserved
Conversation fragments → brief → options → templates → script (video) → board → canon → keyframes → generate → creative → QC → delivery.
Rendering actions remain in the conversation; existing detail controls remain available.
Missing mock intake fields receive visible assumptions; unconfirmed claims remain unconfirmed.
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
