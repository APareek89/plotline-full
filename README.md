# Plotline Marketing Studio

Plotline turns a conversational campaign brief into evidence-backed directions, a script or image board, consistent brand references, and reviewable creative. It puts an approval gate before each expensive step and keeps the artifacts beside the conversation.

**Live app:** [plotline.3-6-183-210.sslip.io](https://plotline.3-6-183-210.sslip.io). Account isolation, two-owner prepared campaigns through Deliver, private media/ZIP, S3 recovery, browser sign-in/reload and one real PixelBin image reroll are verified. The deployed runtime is in ordinary live mode; prepared examples remain provider-free.

## Three-step quickstart

1. Create an account or sign in. Google sign-in and email password recovery are not configured.
2. Select **Try with an example** to open a prepared ceramic mugs image campaign. Review each step in the conversation; its artifacts and follow-up actions remain cached and make zero provider calls.
3. Read the brief and creative in the review pane, open an asset’s detail or download its bundle. For your own work, start a new campaign, give it a name, and describe the product, audience and objective in short messages. Approvals and generation choices stay in the conversation.

The example demonstrates the workflow; it is not evidence of current market research. The separate paid proof generated one image, as detailed below; it did not validate live text generation, video or a fully live campaign.

## What stays in the workflow

- **Campaign Studio:** conversation, structured briefs, grounded options, script/storyboard review, canon references, keyframes, cost confirmation, creative, QC and delivery.
- **My Campaigns:** saved campaign threads, search, sorting and the existing current/archived lifecycle. Completed creative supplies its own thumbnail.
- **My Brand:** reusable characters, products, environments and voices within your account.
- **Review pane:** latest artifact versions, Following/Held navigation, artifact inspection and existing detail controls. Generation controls remain in chat with the available cost information.

The shared UI uses semantic light/dark tokens, self-hosted Inter and Roboto Mono, Lucide icons and layouts for desktop and mobile. It retains the original stage machine and form behavior.

## Source and processes

This is the canonical repository. It merged `plotline-api` and `plotline-web` on 2026-08-31 and preserves both histories. The older Render split repositories are not the source for this AWS launch.

```text
web/             Next.js UI and Auth.js Credentials authority
api/             FastAPI + LangGraph campaign orchestration
api/rag/         importable retrieval package, normally port8788
api/devrag/      keyword-based sample corpus, normally port8787
migrations/      PostgreSQL schema applied by an operator role
```

The browser uses same-origin `/api/...` requests for data, uploads and private media. Next checks the revocable session and CSRF token, then sends a short-lived request/body-bound actor proof to the private API. Campaign state and usage are scoped to the account. Browser drafts are owner-keyed, never adopted from old unscoped storage, and cleared on sign-out/account change.

## Local development

Python **3.12** is required by the retrieval package. Install both the API requirements and the local retrieval package; installing `requirements.txt` alone omits `plotline_rag` and its test extras.

```bash
cd api
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/pip install -e "rag/[test]"
cd ../web
npm ci
```

Authenticated runtime setup requires a fresh PostgreSQL database, the operator-applied migration, a restricted runtime role, verified database TLS, an Auth.js secret, an independent bridge secret and an exact application origin. The hosted images use `Dockerfile.api` and `Dockerfile.web`; apply `migrations/001_portfolio.sql` through the operator role before starting the private API and public same-origin web service. Do not copy a developer’s keys or SQLite state into a hosted environment.

Develop with `MOCK_LLM=1` and `MOCK_MEDIA=1`, isolated data and the sample corpus. Keep real provider keys absent during tests. The legacy four-service development launcher is for the original local fixture setup; it does not provision the new PostgreSQL authentication runtime.

## Verification

```bash
cd api && .venv/bin/python -m pytest
cd ../web && npm run typecheck
node --experimental-strip-types --test tests/client-session.test.mjs tests/media-pricing.test.mjs
PLOTLINE_DIST_DIR=.next-integrated npm run build
node --test tests/root-entry.test.mjs
```

Run pytest without a path: its configuration includes both API and retrieval tests. Use Node24 for the standalone TypeScript client tests. The separate build directory preserves a running baseline `.next` server.

Cross-language tests intentionally inspect the renderer’s artifact-type coverage and read-only spending flag. Keep `web/` beside `api/`. The current Python suite passes256 tests with4 existing retrieval skips. Ten focused client tests cover stale JSON/blob responses, current/old401 behavior, queued uploads, CSRF, owner drafts, failed Credentials redirects, cross-tab account changes, and truthful sample/unverified media cost labels. The merged Next production build R4 and a separate compiled HTTP entry-route regression pass. The latter verifies `/` redirects before the account gate renders. The corrected live browser check also passed: signed-out `/` redirected to Campaign Studio, existing Credentials sign-in succeeded, reload retained the session, and the fresh console had no warnings or errors.

Local compiled Auth.js/BFF checks passed37 account/isolation assertions; the separate prepared journey passed55. On AWS,61 unique checks across101 HTTP requests passed for two owners through Deliver, same-human-canon isolation, private media, matching ZIP hashes and session revocation. Independent audit found zero usage rows and unchanged shared allowance, verified all6 S3 assets against their exact versions/SHA/bytes, and confirmed CA-verified PostgreSQL TLS1.3 with19 protected RLS tables. After one local asset file was safely moved aside, the other owner received404 and its owner received200 through the normal file route; hydration restored the same787 bytes/SHA with the S3 reference unchanged. The exact object version also rejected an unsigned HEAD with403. These free checks use prepared output.

On2026-10-01, one authorized ordinary image reroll dispatched exactly one PixelBin `nanoBanana_generate` operation and returned a PNG of896×1152 pixels (1,587,128 bytes). The request selected4:5; the returned pixel ratio differs. The provider reported1 credit; USD cost remains unknown, so the successful image ledger retains `usage_unavailable` for monetary accounting rather than inventing a conversion. The reservation was created at07:39:55.329UTC and settled at07:40:08.096UTC. The paid output hash and immutable S3 version matched, the other owner received404 for metadata/file, and all8 final assets passed version/SHA readback with the prior7 unchanged. Root browser inspection displayed the real image and PixelBin badge without console warnings/errors.

The proof covers one image reroll from a campaign prepared with mocked text/canon/keyframes. It does not prove live LLM generation, video, full live QC or a complete uncached campaign. Final runtime checks confirmed ordinary text/media live mode, authenticated services, verified TLS, non-root/read-only containers and no proof overlays. No further provider calls were needed for acceptance.

## Launch limits

- No Google OAuth credentials or email password-reset provider are configured.
- Devrag is a clearly labelled sample corpus; production retrieval quality is not established by that demo.
- Prepared examples stay cached even when edited. Start an ordinary campaign to use live providers.
- Model settings in the UI remain unavailable; existing operator configuration chooses stage models.
- Manual prompt overrides are process-local. Reapply them after an API restart before generating; saved campaign/artifact records do not make a pending override durable.
- In-place image editing/inpainting is not implemented.
- Unverified media USD values, including stale PixelBin estimates, are suppressed. Reported provider credits are retained without an assumed USD conversion. Prepared sample media has no provider charge.
- Provider-generated copy and QC still require human review. A successful workflow is not a factual, legal or advertising-policy certification.

Project instructions and historical reasoning remain in `api/Handoff.MD`, `api/Learning.MD`, `api/Loop.MD` and `api/docs/`. Current launch receipts distinguish verified behavior from historical design notes.
