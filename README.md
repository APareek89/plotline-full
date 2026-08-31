# Plotline Marketing Studio

One repo, two processes. A marketing-studio pipeline that takes a solo marketer
from raw context to finished ad creative — image or video — in a single thread,
putting a cheap rejectable artifact in front of every expensive one.

```
api/    FastAPI + LangGraph orchestrator, agents, validators, prompts
        └─ rag/     importable retrieval package (plotline_rag), served on :8788
        └─ devrag/  sample-corpus stub on :8787, serves asset:/stat:/trend:
web/    Next.js App Router UI (:3100)
```

Merged from `plotline-api` and `plotline-web` on 2026-08-31. Both histories are
preserved — `git log` shows every commit from both.

## Run it

One command brings up all four services. `predev` starts the API stack; `dev`
starts Next.

```bash
cd web && npm run dev
```

Then open <http://localhost:3100>.

```bash
npm run stack:status    # what is up
npm run stack:stop      # stop api / rag / devrag (web is Ctrl-C in its own terminal)
```

## First-time setup

The Python side needs **3.12** specifically — `rag/pyproject.toml` pins
`>=3.12,<3.13`, and a 3.13+ interpreter fails to install it.

`requirements.txt` alone does **not** reproduce a working environment. The rag
package is a local editable install and its test dependencies live in an extra,
so both of the `pip install -e` lines are required or the suite fails at
collection with `ModuleNotFoundError: No module named 'plotline_rag'` (or
`moto`).

```bash
cd api
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/pip install -e "rag/[test]"

cd ../web
npm install
```

Copy `api/.env.example` → `api/.env` and fill in `ANTHROPIC_API_KEY`,
`FAL_KEY` and `PIXELBIN_API_TOKEN`. `.env` is gitignored and must stay that way.
Leave `MOCK_MEDIA=1` unless you intend to spend money.

## Verify

```bash
cd api && .venv/bin/python -m pytest      # 208 tests, no path argument
cd web && npm run typecheck                # tsc --noEmit
```

Never run `npm run build` while the dev server is up — it clobbers `.next`.
Use `typecheck` instead.

Two tests in `api/tests/test_marketing.py` read TypeScript out of `web/` on
purpose. They guard facts that exist in two representations across the language
boundary — the artifact-type allowlist and the detail panel's flag — because
that drift has already shipped a dead-end gate once. They resolve `web/` as a
sibling of `api/`, so keep the two directories where they are.

## Docs

- `api/Handoff.MD` — the project brain. Read it first.
- `api/Learning.MD` — root causes already found, in 5-whys form.
- `api/docs/` — PRD, specs, and the stage briefs.
