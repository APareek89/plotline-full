# Plotline — launch handoff
last-synced: `8edc24c`

## Current state — 2026-10-01
The portfolio launch brief supersedes the earlier local-only hosting/auth/palette rules.
App6 is live at https://plotline.3-6-183-210.sslip.io in ordinary authenticated live mode.
Free HTTP/storage, corrected root-entry browser and one real PixelBin image reroll acceptance pass.
Original Render services and unrelated retrieval/Supabase infrastructure remain untouched.

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
