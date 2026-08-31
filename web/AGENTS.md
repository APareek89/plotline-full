# web/ — agent instructions

Repo scope (PRD §7): the Next.js UI (§12 DS grammar — radii 12/16/20, chips, dashed
upload tiles, prompt-bar pattern; Plotline type + palette, explicitly NOT Inter/#6933fa).
Talks only to the api on :8600 — never to the RAG service or Anthropic directly.

## Power Coding (auto — do not remove without asking the user)
The project brain lives in `../api/Handoff.MD`, with Learning.MD, Loop.MD,
docs/mermaid/ and .power-coding/config.json beside it. At session start read that
Handoff and reconcile `git log --oneline <last-synced>..HEAD` before trusting it. All
power-coding duties (checkpoints auto, Loop status machine, FMEA smart-suggest with
fix-P0-only, Sentinel, Pulse, decision log) are defined there and in the root
AGENTS.md — they apply to work in this directory too.
