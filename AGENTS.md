# plotline-full — agent instructions

One repo, merged 2026-08-31 from `plotline-api` + `plotline-web`. Scope is the
whole product: orchestrator, agents, validators, retrieval, and the Next.js UI.

```
api/   FastAPI + LangGraph orchestrator (:8600), rag/ (:8788), devrag/ (:8787)
web/   Next.js UI (:3100) — talks only to api on :8600, never to a model directly
```

Directory-scoped notes live in `api/AGENTS.md` and `web/AGENTS.md`. This file
wins where they disagree.

## Read first

`api/Handoff.MD` is the project brain — read it fully at session start, then
open with its pending points. `api/Learning.MD` carries root causes in 5-whys
form; read the last few entries before debugging anything.

There is no longer a two-repo reconcile step. One `git log --oneline
<last-synced>..HEAD` covers the whole product.

## Standing constraints

- **LOCAL ONLY.** Render autoDeploy is off. Do not push or deploy without asking.
- **Never weaken a test or an invariant to make a change easy** — surface the
  conflict instead.
- **Ask before spending money on real-model runs.** `MOCK_MEDIA=1` is the
  default and media is billed per render.
- **`.env` is gitignored and holds live keys.** Never read it into context,
  never paste a key into chat, never commit it.
- Any architecture-shaping change gets a plain-language delta proposal and user
  approval **before** code.

## Run and verify

`cd web && npm run dev` starts all four services. Setup, including the two
required `pip install -e` lines, is in `README.md`.

- `cd api && .venv/bin/python -m pytest` — 208 tests, no path argument.
- `cd web && npm run typecheck` — never `npm run build`, it clobbers dev's `.next`.

## The recurring bug class

**One fact with two representations and nothing comparing them.** It has shipped
four times in this codebase, most visibly as an artifact type present in the
renderer's switch but missing from `CAMPAIGN_ARTIFACT_TYPES`, which produced a
dead end at a gate while every API test passed.

When you add a fact that must agree in two places — especially across the
Python/TypeScript boundary — add the guard that compares them in the same
change. Two such guards already live in `api/tests/test_marketing.py` and read
`web/` directly.

## Power Coding (auto — do not remove without asking the user)

Update `api/Handoff.MD` before every checkpoint commit and at end of phase —
snapshot, not journal — and re-stamp `last-synced` with HEAD. When it exceeds
~40 lines or ~15 ✅ items, collapse the ✅ into one "Shipped:" line and move the
detail to `Learning.MD`. Log flow changes and user-reported bugs in
`Learning.MD` in 5-whys form. On FMEA/review scans, fix P0 only unless asked.
