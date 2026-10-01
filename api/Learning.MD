# Learning.MD — Plotline
> AGENT: add an entry whenever the basic flow changes, the user reports a bug or gives
> corrective feedback, or something took real time to figure out. CHECK THIS FILE FIRST
> before debugging — the answer may already be here.

### 2026-10-01 — Paid transport uncertainty is not a free retry

A dropped provider response may follow a billed generation. Automatic resubmission or
provider failover can duplicate charges. The hosted adapters now reserve and mark every
dispatch before sending, retain uncertain job/charge evidence, and require an explicit
user retry after ambiguous completion. Known rejection can fail over only where no job
was accepted; policy refusal is terminal. Validation retries remain separate metered
requests, and existing completed-stage checkpoints remain reusable. Regression coverage
replaces the obsolete dropped-stream retry expectation with one dispatch and retained logs.

### 2026-10-01 — Native mock assume mode offered a Start that could not start

**Symptom:** three real HTTP fragments (product, audience, then objective/platform)
left the campaign block absent but displayed Start; Start returned “Not ready yet.”
**Why 1:** `_assume_and_proceed` offered Start without checking the returned context.
**Why 2:** the native mock ignored `assume_mode` and parsed only the current message,
which is intentionally empty for that pass.
**Why 3:** ordinary mock intake requires all campaign fields in one message.
**Why 4:** existing fragmented-intake tests replaced the native mock with scripted
completed contexts, so they did not exercise the deployed mock behavior.
**Why 5 / deepest type:** `test-boundary-gap` — gate reachability was checked against
an ideal parser rather than the real zero-cost parser used for demonstrations.
**Action:** native assume mode reads only user transcript lines, preserves existing
blocks and claim permissions, and labels defaults for missing required fields.
The driver routes the result through the normal completeness/claims gate, with
recursive assumption disabled for that response. A partial real or mock response
asks an honest remaining question instead of offering a false Start.
**Verification:** four focused regressions; the full Python suite (including rag)
passes 208 with four existing skips. The original full HTTP image workflow passed
124 assertions including delivery, all composer CTAs and matching image/ZIP bytes.
No provider calls were made; external network denial and native mocks were active.
**Prevention:** retain a native-parser fragmented conversation test and a partial
structured-output gate test; scripted completed contexts alone are insufficient.

### 2026-08-21 — CCS band test failed on hand-picked ratings

**Symptom:** test_status_bands asserted a rating combo lands between 70 and 85; it scored 87.
**Why 1:** Downgrading three 10–15-weight elements only drops ~13 CCS points from 100.
**Why 2:** The weight table concentrates 55% of weight in hook+audience+retention, so mid-band requires downgrading a heavy element (hook M drops 8.3 alone).
**Deepest why type:** `knowledge-gap`
**Action taken:** Picked hook M + diff M + retention M (82) for the qualified band. (Why 1 level.)
**Preventive action:** When writing threshold tests against weighted scores, compute the score first — don't eyeball rating combos.

### 2026-08-21 — Real plotline-rag wired in; two contract drifts caught

**Symptom:** Codex's plotline-rag landed with a contract that differs from devrag in two
ways: `/resolve_source_ids` returns `{resolved:[], unresolved:[]}` lists (devrag used a
`{id: bool}` dict), and it hosts ONLY the best_practice chunk corpus (no asset/stat/trend).
**Why 1:** devrag was written from the §7 contract sketch before the real schema existed.
**Deepest why type:** `knowledge-gap` (frozen contract wasn't frozen in wire-shape detail)
**Action taken:** RagClient normalizes both resolver shapes; RoutingRag fans out — chunk:*
→ plotline-rag (:8788, DynamoDB resolver), asset:/stat:/trend:* → devrag aux (:8787) until
plotline-kb lands. Citation validation is now two-layer: local subset (cited ⊆ retrieved
THIS run; regen runs seed the allowlist with the stored plan's validated ids) + remote
resolve, both fail closed. tier="seed" evidence rejected unless PLOTLINE_ALLOW_SEED_EVIDENCE.
**Preventive action:** When two repos share a "frozen" contract, freeze it as executable
fixtures (recorded request/response pairs), not prose — the normalizer in rag_client.py
now tolerates both shapes so the next drift degrades gracefully.

### 2026-08-21 — (inherited from Codex/rag) DynamoDB batch items were double-serialized

**Symptom:** Mocked DynamoDB store rejected `source_id_full` as a map instead of a string.
**Why:** Values were serialized once in code and again by the resource client's handlers —
`resource.meta.client` keeps resource-layer transforms; the batch path mixed API levels.
**Action taken (Codex):** Separate `session.client("dynamodb")` for typed batch writes;
Table resource only for ordinary gets. Lives in rag/src/plotline_rag/store/ddb.py.
**Preventive action:** Test every persistence adapter through moto at the SAME API level
and request shape production uses.

## 2026-08-24 — A truncated LLM response reported itself as a JSON syntax bug

**Symptom.** `council.chair` burned all 3 attempts (868s) with
`Expecting ',' delimiter: line 217 column 295 (char 18136)` and once
`no JSON object found in agent output`. The previous session's handoff predicted a
prompt-size/schema bug and pre-authorized sharding the chair per concept.

**Why-chain.**
1. Why did the chair fail? Its output was not parseable JSON.
2. Why was it unparseable? It stopped mid-string — the body was a *prefix* of valid JSON.
3. Why did it stop mid-string? `stop_reason` came back `max_tokens`.
4. Why did it hit the cap? Extended-thinking tokens are billed against the SAME
   `max_tokens` budget as the answer; a thinking chair + a large Feedback object
   exceeded 16000 together.
5. Why did nobody see that? `runner._llm_call` never inspected `stop_reason` — it
   returned the truncated text, and `json.loads` blamed the only thing it can see:
   syntax. **Deepest why: `code`** — a missing guard on an external-API status field
   turned an overflow into a lie about its own cause.

**Action (targeted at why-5, not why-1).** Raise `AgentTruncated` on
`stop_reason=max_tokens` instead of parsing; join all text blocks (was first-only);
`MAX_OUTPUT_TOKENS` 16000→32000; stream always (the SDK refuses non-streamed calls whose
budget implies >10min — raising the cap alone broke the planner until streaming landed);
persist the failing body to `data/runs/raw/`.

**Preventive action for the class.** Never hand an external API's payload to a parser
without first checking the status field that says whether the payload is complete. The
parser's error message describes the *shape of what arrived*, never *why it arrived that
way* — so an unchecked truncation/pagination/partial-write always surfaces as a plausible
lie. Two acceptance checks now hold this: a truncated body is never parsed as complete,
and a multi-block answer is never silently halved.

**Cost of the missing observability.** Three full real-mode runs (~45 min, planner + 3
seats each) to learn what one saved raw body showed instantly. The very next bug (R2
lexicon) was diagnosed in a single run *because* the raw capture existed.

## 2026-08-24 — A validator checked a lexicon while the prompt described an intent

**Symptom.** `campaign_planner.options` failed R2 on all 3 attempts: "receipt required —
the storyline must name what the viewer literally SEES as proof".

**Why-chain.** The planner HAD written visible proof — "camera holds on the screen as
the bloom visibly shrinks". Why did it still fail? R2 is a literal substring match against
`validators._RECEIPT_CUES`. Why didn't the planner use those words? The prompt only said
"R1-R7 anti-generic rules apply: receipts, specificity". **Deepest why: `design`** — one
rule had two representations (prose in the prompt, a lexicon in the validator) and nothing
kept them in sync. Same species as the two bugs fixed the session before.

**Action.** The prompt now has the lexicon *injected* from `validators._RECEIPT_CUES` via
`prompt_replacements`, plus an explicit "a camera move is not a receipt" contrast. The
validator was NOT weakened. planner 1.2.0→1.3.0.

**Preventive action.** When a check is mechanical, the prompt must quote the mechanism,
generated from the same constant the check reads — never a hand-copy. A test asserts every
enforced cue appears in the built system prompt, so drift fails in CI, not in a paid run.

## 2026-08-25 — An optional field that was impossible to skip

**Symptom.** "Make policy extract optional." The Brand Policy Document was ALREADY
optional in `BrandBlock` and `_policy_text` handled its absence gracefully, so the
request looked like it was already satisfied.

**Why-chain.**
1. Why does it feel mandatory? Because the Brand card cannot be completed without it.
2. Why not? `claims_confirmed` gates the card, and the only way to set it is the
   "Confirm claims" button.
3. Why can't that button be reached? It rendered only when
   `aux.candidates.approved_claims.length > 0 || banned_words.length > 0`.
4. Why would that ever be zero? No policy doc + a product description with nothing
   quotable extracts nothing — confirmed live: `{approved_claims: [], banned_words: []}`.
5. **Deepest why: `design`** — an optional INPUT was wired to a mandatory OUTPUT. The
   schema said optional; the only path through the UI said otherwise.

**Action (aimed at why-5).** Show the confirm surface whenever extraction has run, allow
manual entry, and permit confirming an empty list with the consequence stated inline.

**Preventive action for the class.** When a field is optional, trace the whole path it
feeds and check the terminal action is still reachable when it is absent. "Optional" is a
property of the PATH, not of the field declaration — a nullable column proves nothing.
Two acceptance checks now pin it: the card completes with no policy doc, and an empty
approved list still rejects any claim a detail tries to use.

**Second lesson, cheaper.** The instinct was to read "make it optional" as "relax the
gate". The gate was not the problem, and relaxing `claims_confirmed` would have broken a
stated invariant. Reading the request as a bug report rather than a spec change found a
fix that made compliance stricter, not looser.

## 2026-08-25 — "Works on my machine" three times in one session

**Symptom.** Three separate breakages, all with the same signature: green locally, broken
where it actually runs.
1. `langgraph` imported by `app/graph.py` but never added to `requirements.txt` → 83 tests
   passed while the Render build produced an app that crashed on import.
2. `tests/conftest.py` isolated `DB_PATH` but not `LOG_DIR` → every test run appended to the
   real `agent_runs.jsonl`, and the new observability page showed a deliberate test fixture
   (`campaign_planner.test` returning `{"options":[{"option_id":"o1"}]}`) as a production
   failure. The user reported it as an app bug. It was mine.
3. `npm run build` and `npm run dev` share `.next` → verifying a change with a production
   build left the running dev server serving MODULE_NOT_FOUND. Cost three restarts.

**Why-chain.** Why did each pass locally? Because the local environment had something the
target didn't — an extra installed package, a shared writable path, a warm build directory.
Why wasn't that caught? Because "the tests pass" was treated as equivalent to "this works".
**Deepest why: `process`** — verification ran in the developer environment, which is by
definition the one environment where the bug cannot appear.

**Action.** (1) `langgraph>=1.2,<2` pinned, and proven by importing `app.main` from a
**fresh venv built from requirements.txt alone**. (2) `LOG_DIR` monkeypatched to `tmp_path`,
with a test asserting `config.LOG_DIR != data/runs`, and the 76 polluted records removed.
(3) `npm run typecheck` (`tsc --noEmit`) added so compile checks never touch the directory
dev is serving.

**Preventive action for the class.** A green test run in the dev venv proves the code is
correct, not that it is *deployable*. Anything that changes dependencies, writes to a shared
path, or produces build artefacts needs one check in a clean environment before "done" —
and the check should be constructed so that the old behaviour would have failed it.

## 2026-08-25 — Three bugs stacked behind one refused message

**Symptom.** User typed a real brief with an attached image at the path step and got
"Didn't catch a campaign command."

**Why-chain.** (1) `_parse` at `stage=paths` only accepted path-choice keywords, so a real
brief fell through to the hint — the app asked the user to pick a path *after* they had
answered by typing. (2) Fixing that exposed the attachment being stringified into the prose
as `[attached images: upl_x]`, so the agent got an opaque id as words with no instruction —
the file was silently dropped. (3) Fixing that exposed intake hard-failing 3/3 because the
model emitted a HALF product block (`name: null, description: null`) when the message named
a use case but not a product. **Deepest why: `design`** — each layer assumed the layer
before it had produced something well-formed, and none of them said so out loud.

**Action.** Free text at `paths` starts the conversational path with that message; uploads
travel as `UserEvent.upload_ids` and are applied SERVER-SIDE (`_apply_pending_uploads`) so a
model that ignores them cannot lose the user's file; prompt 1.3.0 states blocks are
all-or-nothing with the user's own sentence as the worked example.

**Preventive action.** The tests passed throughout, because they call `save_block()` with
structured data — they never type like a person. Any conversational surface needs at least
one test that goes in through the same door a user does. Bugs 1–3 were all reachable only by
driving the app.

## 2026-08-25 — A validator and a doctrine gave the same seat opposite orders

**Symptom.** With the frozen council doctrine wired up, `test_unmapped_claim_produces_a_kill_flag`
failed: the whole campaign hard-failed after 3 chair attempts with
`a multiplier claim ('3x faster')`. The council had correctly caught an unapproved
claim and was rejected for saying so.

**Why-chain.**
1. Why did the chair fail? `validate_council`'s benchmark guard matched "3x faster".
2. Why was that text there? The Brand seat put it in `kill_recommendation`, and the
   chair relayed it into `lenses.claims_safety`.
3. Why did the seat write a number? Because doctrine D8 ORDERS it to: "quote the
   offending phrase verbatim when you flag it."
4. Why did the guard exist? Because a council with no corpus cannot know a benchmark,
   so a magnitude in its output is a fabrication.
5. **Deepest why: `design`** — both rules were right, and neither knew about the other.
   The guard could not distinguish a magnitude the council ASSERTS from one it QUOTES
   in order to refuse. They are opposites, and the one place they collide is the
   compliance path — the highest-value thing the council does.

**Action (aimed at why-5).** `_check_no_benchmarks` strips paired-quote spans before
scanning. A number held at arm's length is attributed to the draft; only what is left
is the council speaking in its own voice. The guard was NOT weakened for anything
unquoted, and the patterns stayed narrow (percentages, ad-metric acronyms, duration
thresholds, multipliers) so a seat can still reference the draft's own numbers —
"shot 2 runs 4 seconds" is the feasibility judgment D10 asks for.

**Preventive action for the class.** When a mechanical check and a prompt instruction
touch the same field, ask what the check does to the output the instruction REQUIRES.
The R2 lexicon bug was prompt-and-validator drift — two representations of one rule.
This is its mirror: two rules, each correct, whose overlap nobody owned. A guard on
model output needs to know the difference between the model's own voice and text it
is quoting, or it will punish the model hardest exactly when it is most right.

## 2026-08-25 — A cached graph pinned every campaign's progress to the first thread

**Symptom.** Found while making the rumination graph seat-aware, not from a report.
`_RUMINATION_GRAPH` was a module-level singleton built on first use, and its
`on_step` was `lambda label: _working.__setitem__(thread_id, label)` — closing over
the `thread_id` of whichever campaign happened to build it.

**Why.** Every later campaign in the same process wrote its progress labels onto the
FIRST campaign's thread. "Labelled working steps, never a bare spinner" therefore held
on campaign one and broke silently on campaign two — the second user would sit on a
bare spinner while a stale thread flickered. A server restart between campaigns hides
it, which is why local testing never surfaced it.
**Deepest why: `code`** — a closure captured a per-request value into a
process-lifetime object.

**Action.** `on_step` reads `runner.current_thread` (a contextvar already set per
worker thread at the top of every turn) instead of a closure. Graphs are now cached
per seat-roster, so the cache itself grew a legitimate key and the bug's hiding place
went with it. An acceptance check drives `on_step` under a different contextvar value.

**Preventive action.** Anything cached for the process lifetime must not close over a
per-request value. When memoising a factory, check every callable in its arguments for
captured request state — the cache key hides the bug, because the second caller gets
an object built for the first.

## 2026-08-25 — A network blip threw away ten minutes of paid, successful work

**Symptom.** The final real-mode verification on the production models died with
`httpx.RemoteProtocolError: peer closed connection without sending complete message body`.
The thread escalated. In the run log the chair had NO ROW AT ALL — it simply was not there.

**Why-chain.**
1. Why did the rumination fail? The chair raised an httpx transport error.
2. Why did that kill the run? `run_agent`'s retry loop catches
   `(ValidationError, AgentValidationError, ValueError, json.JSONDecodeError)`.
   `httpx.RemoteProtocolError` is none of those, so it propagated out of run_agent.
3. Why was there no log row? `_persist_log` runs on success and on final validation
   failure — both INSIDE the loop. An exception escaping the loop skips it, so the node
   vanished from observability exactly when observability was needed.
4. Why was the cost so high? The planner (209s) and all three seats (120s/137s/139s)
   had already SUCCEEDED and been paid for. One blip at the join discarded all of it.
5. **Deepest why: `code`** — the retry loop was built around "the model gave a bad
   answer" and had no concept of "the model never got to answer". Those need opposite
   handling: one re-prompts with a correction, the other re-issues verbatim.

**Action (aimed at why-5).** `AgentTransport(ValueError)` — subclassing ValueError so the
existing loop picks it up, the same trick `AgentTruncated` uses. `_llm_call` catches
`httpx.TransportError` and `anthropic.APIConnectionError` ONLY: an `APIStatusError`
(401/403/400) is a real answer from the server and must surface immediately rather than
spin. A `last_transport` flag suppresses the "your previous output failed validation"
message, because there was no output — appending it would make the model rewrite a good
answer it never sent. Small backoff between attempts; still bounded by
MAX_VALIDATION_RETRIES. Two acceptance checks pin both halves.

**What this does NOT fix.** The retry re-runs ONE node. The real exposure is that a
failure anywhere still discards every completed node in the rumination — this run had
four successful paid nodes riding on the fifth. That is the stage-level checkpoint work
(Handoff "VIDEO FLOW" item 5), and v3 makes it worse by adding five stages. This bug is
the cheap half; the structural half is still open.

**Preventive action for the class.** A retry loop around a network call needs to
distinguish "bad answer" from "no answer". Check what the loop's `except` clause does NOT
name — anything unlisted escapes past the persistence that makes the failure diagnosable,
so the most expensive failures become the least visible ones.

## 2026-08-25 — A gate with a renderer nobody routed to

**Symptom.** Every v3 acceptance test passed and two API-driven QA runs passed,
but in the browser the campaign brief drew a dashed placeholder with the type
name and NO BUTTONS. The flow dead-ended at the first new gate.

**Why-chain.**
1. Why no fields? `CampaignBriefCard` never rendered.
2. Why not? The thread page routes an artifact to the campaign renderer only if
   `isCampaignArtifact(type)` is true; otherwise it falls to the legacy card.
3. Why was it false? `CAMPAIGN_ARTIFACT_TYPES` — a SECOND list, separate from
   the switch — did not contain the new types.
4. Why did nothing catch it? Every test drove the API. The renderer, the switch
   and the allowlist all live in TypeScript, and the suite is Python; the two
   lists that had to agree were never compared by anything.
5. **Deepest why: `design`** — one fact ("this type is a campaign artifact") had
   two representations in the same file, and adding a case to the switch looked
   complete because the switch is where a reader goes to add a renderer.

**Action (aimed at why-5).** A guard in the Python suite that READS the
TypeScript: every `case` in the switch must appear in the allowlist, and every
v3 type the server can emit must appear in both. Verified it bites by removing
one entry and watching it fail with that entry named.

**Preventive action for the class.** This is the third instance of the same
species — the R2 lexicon (prompt vs validator), the W1 table and B3 slot caps
(prompt vs config), and now the renderer allowlist (switch vs list). When one
fact has two representations, something has to compare them, and the comparison
belongs wherever the test suite actually runs even if that crosses a language
boundary. "Both files are in the repo" is not a check.

**Second lesson.** Two green API QA runs and 155 passing tests did not notice a
dead end at the FIRST gate a user reaches. An API test proves the server can
produce an artifact; it says nothing about whether the artifact is reachable.
Any flow with a UI needs at least one pass driven through the UI — the same
lesson as "the tests call save_block(), they never type", one layer up.

## 2026-08-26 — Three cards, one button, two of them unreachable

**Symptom.** Driving the new two-pane UI, the options turn offered a single
`Approve` above the composer. Three campaign options were on screen; only
option THREE could ever be approved, and the button did not say so.

**Why-chain.**
1. Why one button? `_options_from()` was handed `artifacts[-1]`.
2. Why the last one? The CTA lift was written against turns that post ONE
   actioned card, which is every turn except this one.
3. Why did the acceptance check miss it? It compared the EVENT NAMES a card
   declares against the event names offered, as sets. All three cards declare
   `approve`, so `{"approve"} ⊆ {"approve"}` held while two of the three cards
   had no reachable button.
4. **Deepest why: `design`** — the check compared verbs and ignored objects.
   An action's identity is (what it does, what it does it TO); dropping the
   object made three different CTAs look like one.

**Action (aimed at why-4).** The lift covers every actioned artifact in the
turn, and labels carry the artifact id when more than one card is in play —
three buttons reading `Approve` cannot say what they approve. The guard now
compares `(artifact_id, event)` PAIRS, and a second test asserts each option is
separately approvable and that no two approve labels are identical.

**Preventive action for the class.** When a check compares two representations
of an action, the comparison key must include the target, not just the verb.
A set of verbs is the smallest thing that looks like a valid check and isn't:
it passes exactly when the objects differ, which is the case worth catching.

## 2026-08-26 — The board refused honestly and the real fault was two stages back

**Symptom.** `shot_board` burned all 3 attempts. Its first reply was literally
`{"error": "INCOMPLETE INPUT — …resubmit"}`; the next returned zero shots. The
run escalated with "The shot board kept failing its lints."

**Why-chain.**
1. Why did the board fail? Its input was `{"brief": {}, "option": null}`.
2. Why was it empty? The in-memory workspace was lost — the API had been
   restarted mid-campaign.
3. Why didn't `_rehydrate()` restore it? It handles `campaign_option`,
   `campaign_detail`, `model_confirm`, `creative_set` and `ad_card` — the v2
   artifacts. It was never taught `campaign_brief`, `hook_rack`, `canon_sheet`
   or `keyframe_board`.
4. Why not? v3 added five stages and their artifacts; the rehydrator lives in a
   different part of the file and nothing forced the two to agree.
5. **Deepest why: `design`** — the same one-fact-two-representations family.
   The set of artifacts the workspace DEPENDS ON grew, and the code that
   restores them from the transcript did not.

**Action (aimed at why-5).** The four v3 artifacts are rehydrated. A test kills
every in-memory workspace mid-flow and asserts the brief, the hook rack and the
approved option all survive. Verified it bites: without the fix it fails with
`brief = None`, which is exactly what the live run hit.

**Preventive action for the class.** An agent that refuses because its INPUT is
incomplete is reporting a fault upstream of itself, and the retry loop will
faithfully repeat the bad input three times and then blame the last node. When
a node fails on validation, read what it was GIVEN before reading what it
returned — `node_input` in the run log answers that in one look, and it is the
reason this took one run to find rather than three.

**Second lesson.** Both of today's bugs were invisible to 165 passing tests and
visible within minutes of clicking through the app. That is now the fourth
time. The rule stands: a flow with a UI needs one pass driven through the UI,
every time, no exceptions.

## 2026-08-26 — The board was blamed for an input nobody gave it

**Symptom.** A live QA run escalated: "The shot board kept failing its lints." Asked
for a two-shot film, it produced eight shots and six distinct characters, failed B1/B4
three times, and gave up.

**Why-chain.**
1. Why did the lints fail? Too many shots, too many characters, too many refs per shot.
2. Why did it over-produce? It was reconstructing the campaign from the brief alone.
3. Why only the brief? Its payload carried `option: ws.get("approved_option_json")`.
4. Why was that null? **`approved_option_json` was READ by two turns and WRITTEN by
   nothing.** It never existed. The script and board had been handed `option: null`
   for the entire life of v3.
5. **Deepest why: `design`** — a mirrored copy of a fact that nobody kept in sync,
   which is the same family as the R2 lexicon and the renderer allowlist. The cheapest
   version of that lesson is not to keep a second copy at all.

**Action (aimed at why-5).** `_approved_option_json(ws)` DERIVES the JSON from the one
slot that is actually written. There is no second slot to drift. A test asserts the
option reaches the board and that no mirrored key comes back.

**Preventive action for the class.** A slot that is only ever read is not a slot, it is
a typo with a default. Grep any new workspace key for its WRITE site before trusting it;
`ws.get(x)` returning None looks identical whether x is empty or misspelled.

**Second lesson — read what a node was GIVEN.** The run log's `node_input` said
`option: null` immediately. The validation errors, which is where attention goes, only
described the *shape of the output*. An agent that fails its checks is often correct
about the input it was handed.

## 2026-08-26 — A default that could never apply, and a QA that typed like a spec

**Symptom.** A real user typed three fragments — "help me with an ad for this product
as part of summer campaign" / "instagram, young women, its a comfortable everyday wear
top" / "awareness" — and got "Noted.", "Noted.", then "Intake couldn't produce a valid
context after retries." Nothing was filed. The conversation was dead.

**Why-chain.**
1. Why did nothing file? Every campaign block failed validation.
2. On what? `campaign.creative_type` — "Input should be 'video' or 'image', got None".
3. But it HAS a default (`= "image"`). Why did the default not apply? **A pydantic
   default only applies when the key is ABSENT.** The model sent it explicitly as null.
4. Why did it send null? Our prompts print the full OUTPUT SHAPE, so the model
   dutifully emits every key, filling unknown ones with null.
5. **Deepest why: `design`** — the schema and the prompt disagreed about what "unknown"
   looks like. The schema says "omit it"; the prompt says "print every key". Between
   them sat a default that was unreachable by construction.

Second, independent cause: `product.name` is required, and the user DESCRIBED without
NAMING ("a comfortable everyday wear top"). People describe; they rarely name.

**Action.** `Strict` gains a `mode="before"` validator: an explicitly-null field that
HAS a default is dropped so the default applies. Required fields still fail loudly, so
this is not a blanket "nulls are fine". The intake prompt now says to OMIT unknown
optional keys rather than write null, that a name may be a LABEL derived from the user's
own words, and that creative_type is INFERRED from the platform, never asked — it is a
production decision nobody should have to make before describing the product. And a
parse failure no longer escalates: the conversation is the only way into this product,
so it keeps the thread alive and asks for the gap.

**Preventive action for the class.** A field with a default is only optional if the
producer is allowed to omit it. When a prompt prints a schema, it is a second
specification of that schema — and the two must agree about absence, not just types.

**The QA lesson, which is the bigger one.** 182 tests and a full browser walk missed
all of this because every intake test either called `save_block()` with structured data
or typed ONE well-formed sentence containing everything. Real users type in fragments.
The new test asserts the SHAPE of a fragmented conversation reaching a startable
campaign, not the wording of any turn. This is the third time this file has recorded
"the tests never type like a person", and the first time a test actually does.

## 2026-08-26 — The zero-spend rehearsal cannot get past its own front door

**Symptom.** Driving the new canon gate under `MOCK_LLM=1` — deliberately, to QA a
media change without paying for Haiku — intake never completed. Four fragments in,
the app said "I filled the gaps so we can get moving" and offered **Start**. Start
answered "Not ready yet. Campaign context incomplete — still needed: product,
campaign." A CTA that refuses itself.

**Why-chain.**
1. Why did Start refuse? `begin_rumination` found `product`/`campaign` still null.
2. Why were they null? The assume pass ran and filled nothing.
3. Why nothing? `_assume_and_proceed` calls `run_agent(...)` with `assume_mode: True`,
   and under MOCK_LLM that resolves to `campaign_mock.mock_campaign_intake`, which
   **has no concept of assume_mode**. It fills at most the one block the CURRENT
   message names by keyword — and the assume pass deliberately sends `message: ""`.
   So the stand-in returns the context unchanged, by construction.
4. Why did the turn then offer Start? `_assume_and_proceed` posts its "I filled the
   gaps" message and the Start action **unconditionally**, without asserting that the
   context it got back is actually complete.
5. **Deepest why: `design`** — a prompt-level behaviour was added without its
   stand-in, and the code that consumed it trusted the result instead of checking it.
   The mock is not a test fixture here; it is the ONLY zero-cost path through the
   product, so a behaviour it cannot reproduce is a behaviour that cannot be
   rehearsed for free.

**Not fixed — reported to the owner.** This lives in freshly-shipped intake work
(`7a806ce`) and the right fix is a decision, not a patch: either the mock learns
assume_mode, or `_assume_and_proceed` refuses to offer Start on an incomplete
context, or both. Point 4 matters in REAL mode too — a model that under-fills in
assume mode produces the same dead end, and that is the failure the owner's own
"never strand the user" rule exists to prevent.

**Preventive action for the class.** When a new agent behaviour is added behind a
prompt flag, the mock has to learn it in the same commit. MOCK_LLM is not a test
convenience — it is the free rung of the loop, and a rung that cannot reach the
stage under test silently promotes every QA pass to a paid one. And a turn that
posts a "we're ready" CTA must assert readiness from the DATA it just received,
never from the fact that the call returned.

## 2026-08-26 — A guard that was right, and a dead end four gates past where it looked

**Symptom.** The Stage 6 dry run reached `qc`, printed "QC cleared.", and stopped.
No options in the composer, no Ad Card, no film. The campaign could not be
finished by any means available to a user.

**Why-chain.**
1. Why could nothing be pressed? The turn carried no question, so the composer
   rendered no options.
2. But the `qc_report` DECLARED a `deliver` action. Why was it not offered?
   `_say(...)` only lifts options from artifacts when a question exists —
   `question=None if report.verdict == "cleared"` skipped the lift entirely.
3. Why did nothing catch it? `test_every_cta_a_card_declares_is_answerable_in_the_chat`
   exists for precisely this failure and compares `(artifact_id, event)` pairs
   correctly. It walked as far as `_pass_script()` — four gates short of qc.
4. Why did the walk stop there? It was written when the script was the last new
   gate, and grew no further as v3 added canon, keyframes, generate, creative
   and qc behind it.
5. **Deepest why: `process`** — a correct check with a short walk reads exactly
   like a check that passes. Coverage of the RULE was never the question;
   coverage of the FLOW was, and nothing measured it.

**Action (aimed at why-5).** The guard now walks to `done` and asserts it saw a
`qc_report` and at least seven actioned cards, so a walk that silently shortens
fails instead of passing quietly. The qc turn asks "Deliver the campaign?" when
it clears. Verified it bites: restoring `question=None` fails with
`[('qc_report', 'qc', ['deliver'])]`.

**Preventive action for the class.** A guard over "every X must satisfy Y" is
only as good as the set of X it visits, so it has to assert the SIZE and REACH
of that set, not just the property. Two of the last three dead ends in this
project were at a gate no test had ever walked to — the rule was never wrong,
the itinerary was.

## 2026-08-27 — The rule that mattered was never stated, only its limit

**Symptom.** First real-media run. The shot board returned eight shots with EMPTY
`cast_refs`, `product_refs` and `env_refs` on every one. `canon_plan` then proposed
`@trail_shoe`, `_validate_canon_plan` rejected it as "planned but the board never
references them", and the run escalated blaming the canon agent.

**Why-chain.**
1. Why did canon fail? It planned a sheet the board did not reference.
2. Why did the board reference nothing? Nothing told it to. The prompt's
   reference section is titled "REFERENCES ARE BUDGETED, AND HERE IS THE BUDGET"
   and describes only a CEILING — a board attaching zero references satisfies
   every word of it.
3. Why did that matter beyond canon? A keyframe is seeded from the canon ids its
   shot BINDS. With no binds, every sheet conditions nothing, and the entire v5
   consistency chain — the whole point of the phase — was inert on real output.
4. Why did nothing catch it? The MOCK board fixture carries refs. Six zero-spend
   walks showed the chain working perfectly because the fixture was doing the
   thing the real model was never asked to do.
5. **Deepest why: `design`** — a constraint was written where a requirement
   belonged. "Do not exceed N" and "produce at least one" are different
   instructions, and only one of them was given.

**Action (aimed at why-5).** shot_board 1.1.0 says to give each recurring subject
an `@slug` id, put it on every shot that shows it, and states the consequence in
the prompt: a shot with no refs is generated from words alone, so the product in
shot 5 need not match shot 1. `_board_binds_its_product` refuses a board that
declares a product and references it nowhere, so the failure lands on the board
with a fixable message instead of on canon two stages later.

**Preventive action for the class.** When a prompt describes a budget, a cap or a
limit, check that something also states the FLOOR. A ceiling with no floor reads
as complete and is satisfied by doing nothing. And a mock fixture that is richer
than real model output does not de-risk a feature — it hides whether the feature
exists, and the more walks it passes the more confident everyone gets.

**Second lesson.** Four live runs were needed to reach the first video, and every
one of the four failures was a prompt/contract disagreement rather than a bug:
refine told to return a CampaignDetail while validated as CampaignOptions; Haiku
unable to hold a byte-identical copy rule; the board never asked for refs; the
provider silently snapping 2.5s beats to 4s. All four were invisible to 200
passing tests and to six MOCK walks.


## 2026-10-01 — Account state must expire before an asynchronous identity refresh

**Symptom.** A second tab could change the shared session cookie while the first tab still accepted an old-account response during `/api/session` refresh.

**Why-chain.**
1. Storage notification started a refresh but did not immediately invalidate pending work.
2. The old owner remained current until that network response finished.
3. Body parsing and Blob downloads could outlast headers, so checking only HTTP arrival was insufficient.
4. Browser drafts and queued uploads also belonged to the old owner.
5. **Deepest why: design** — a cookie change was treated as a refresh hint instead of an immediate identity boundary.

**Action.** The notice synchronously fences/aborts old work and hides the workspace, then refreshes identity. Requests retain the original generation through JSON/error/Blob parsing; queued uploads recheck it. Owner drafts never adopt legacy global values. Deterministic delayed-A-after-B, old401/current401 and cross-tab regressions pass.

**Prevention.** Capture one account generation at the start of every asynchronous user operation, keep it through body consumption and subsequent writes, and test the old response arriving after the new account is active.

## 2026-10-01 — An estimate inherited from another provider is not a price

**Symptom.** The render gate displayed inherited dollar amounts and `1 credit = $0.10` even though PixelBin's USD conversion was not verified; temporary mock media also lacked clear Sample provenance.

**Why-chain.**
1. Old UI helpers converted stored fal-era constants into apparent spend and credit totals.
2. The active media adapter could serve a different provider.
3. Provider identity and billing units did not travel through every artifact schema.
4. Missing/zero values were displayed as free instead of unknown.
5. **Deepest why: design** — planning estimates, provider-returned credits and sample output were represented as one money field.

**Action.** Backend-stamped sample/provider/billing metadata now accompanies artifacts. Sample displays zero provider cost. PixelBin or `usd_unverified` suppresses numeric USD; actual finite decimal credits are displayed only when returned. No conversion is inferred. Creative/canon/keyframe provider badges use recorded fields or explicit adapter prefixes, never an unprefixed model guess.

**Prevention.** Carry amount, unit, source and verification status together. Cover unknown, sample, decimal-string credits and a provider switch in the display contract before presenting a number as money.

## 2026-10-01 — A background failure needs a durable user recovery path

**Symptom.** A missing import in new artifact metadata interrupted a mock campaign after a gate; an empty prepared campaign could also exist after initialization failed.

**Why-chain.**
1. The worker failed after state had been created.
2. A process-local retry callback could disappear when the service restarted.
3. The last visible question did not establish whether replay was safe.
4. Automatic replay could charge again if a provider had already completed work.
5. **Deepest why: design** — resumability needed a persisted, allowlisted operation descriptor and an explicit user decision, not only an error string.

**Action.** Backend repair retains saved artifacts and canonical initialization, stores allowlisted primitive job arguments and revalidates current session/ownership before a retry. The conversation displays only the returned Retry control and the warning that prior provider work may have been charged. The frontend never triggers it automatically. Backend recovery tests cover workspace loss and zero-provider cached replay. Local compiled HTTP55 checks and live prepared HTTP61 checks subsequently passed.

**Prevention.** Test a real worker failure followed by process-local state loss, verify the persisted recovery contract, and prove that merely reopening a thread cannot dispatch another provider request.


## 2026-10-01 — Hosted owner boundaries and truthful media receipts
- Problem: personal SQLite/canon names and file paths could not isolate public accounts; a global canon primary key collided across users.
- Why: canon is reusable within a workspace, but the original workspace implicitly meant the whole process.
- Fix: explicit actor scope, short owner-bound PostgreSQL transactions and forced RLS; composite owner/canon keys, retained owned canon assets and generation history after campaign deletion.
- Evidence: actual non-owner PG tests reject foreign upserts/files, preserve A/B concurrent identities, reuse canon after deletion and deny runtime TRUNCATE.
- Problem: a new sample artifact label used an unimported config symbol; preview example/brief serialization failed and an in-memory retry pointer disappeared after restart.
- Why: the label was initially tested as a slice, while the complete conversation path and restart boundary had not yet rerun.
- Fix: imported the explicit dependency, reran the whole suite, persisted only allowlisted job identifiers/bounded primitive args in owned checkpoints, and exposed explicit Retry with an uncertain-charge warning.
- Evidence: a cached serializer failure followed by workspace loss and explicit retry reaches the brief with provider transport poisoned; no automatic replay.
- Problem: legacy fal-derived USD/credit estimates were being presented as PixelBin charges and sample resolution.
- Fix: provider-qualified planned/actual model metadata, Sample/no-charge labels, null unknown credits, actual returned credits retained, unverified conversion labelled without fabricated billing claims.
- Regression guard: complete compiled auth/BFF and cached media/bundle journey accompany the unit and real-PG tests; original failure receipts are preserved outsidegit.


## 2026-10-01 — Redirect an entry URL before an account gate reveals its page

**Symptom.** Production sign-in from `/` succeeded at the HTTP/auth boundary but raised React error310 in Next AppRouter. Direct navigation to `/studio/campaign` with the same session worked. The failure receipt is retained in the private launch evidence as `root-live-root-signin-failure.json`.

**Why-chain.**
1. The root Server Component performed a redirect only when the account shell revealed its children.
2. Successful sign-in also requested client navigation to the destination.
3. The two entry transitions reached Next AppRouter while its redirect/navigation state changed during rendering.
4. Local authentication checks had entered the destination directly, so they did not exercise the delayed root route.
5. **Deepest why: design** — a fixed entry-URL redirect was implemented inside authenticated rendering rather than at the HTTP routing boundary.

**Action.** Next configuration now returns a307 from `/` to `/studio/campaign` before the account layout renders. The existing destination, auth flow and page fallback remain intact. A fresh production build and isolated compiled-server test verify root, query-preserving and RSC requests redirect, while the destination serves200 without account/database/provider configuration. The corrected live browser gate subsequently passed: signed-out root307 to studio, existing Credentials sign-in, reload with authentication retained, and no fresh console warnings/errors.

**Prevention.** Check both the public entry URL and direct workspace URL for sign-in, not only the destination route. Keep fixed URL redirects ahead of client account gates; retain real compiled HTTP regression coverage alongside browser acceptance.


## 2026-10-01 — Distinguish saved artifacts from pending manual overrides

The existing prompt-edit route changes the current worker's pending prompt map and logs the edit, but it does not persist that override as restartable pending state. Durable campaign/artifact records and explicit job recovery therefore do not guarantee a manual override survives an API restart. This launch documents the limitation: reapply an override after restart before generating. No persistence change or stronger durability claim is included in the release.


## 2026-10-01 — Report the returned media units and dimensions

The sole launch image reroll succeeded through PixelBin `nanoBanana_generate`, returned1 provider credit and stored an exact-version/SHA-verified PNG of896×1152 pixels (1,587,128 bytes). The request selected4:5, but those dimensions are not exactly4:5. USD conversion was unavailable; the ledger's `usage_unavailable` status records that missing monetary information, not a failed image. Acceptance therefore claims one working image reroll and the actual returned credit/dimensions, without a fabricated USD amount, ratio guarantee, live text/video or full-QC claim. Mocked preparation and the earlier browser failure receipts remain distinct evidence.


## 2026-10-01 — Test conversation transitions, not only seeded action buttons

**Failure.** A user supplied a summer t-shirt campaign and then “regenerate and use brand - Anand”. The driver rejected the sentence as an unknown command; a required brand-state check and omitted image references also prevented the advertised minimal-start flow.

**Five whys.** (1) The parser handled command-like text only at some stages. (2) Brand name had no schema field and readiness disagreed with the displayed missing fields. (3) Tests seeded complete context and used action events, skipping the user's natural replies. (4) Provider references were verified at keyframes but not from the uploaded product into canon anchors and creative edits. (5) **Deepest why: design and acceptance scope** — local button-path success and one image reroll were treated as evidence for the whole conversational workflow.

**Repair.** Required start input is photo plus prompt; business gaps stay explicit questions. Natural approvals are stage-scoped; literal brand-name edits preserve every unrelated fact, and a rebrief invalidates current derived approvals without deleting history. Uploaded pixels and owner-verified signed references reach the existing vision/media paths. Missing live references fail before rendering. Informational text cannot authorize an implicit reroll; visual edits have explicit verbs and status commands use full phrases.

**Prevention.** The exact conversational flow now runs through the real driver/store/validators with deterministic providers, including restart and delivery. Assertions count four media operations and prove cost/model questions cause zero media, “olive” remains an edit, an incomplete “yes” does not invent business details, and name-only edits cannot change audience or claims. Native plus isolated PostgreSQL contracts pass (263 combined, four local ffmpeg skips). Root-owned live full-flow QA is still required; mocked output is not evidence of product fidelity or provider success.


### Same owner, different product: preserve the existing canon identity

The added product-reference equality check initially prevented inappropriate reuse but still wrote the new render under the old human canon slug. The library UPSERT therefore replaced earlier campaign data. The root review caught this before deployment. A real store regression first reproduced the changed row, then verified that a different product receives a deterministic new canon ID, the current board uses that ID after restart, and both old library metadata and old assets remain unchanged. Same-product reuse remains free. Identity validation must include the persistence key and downstream bindings, not only the render inputs.


## 2026-10-01 — A constraints lock does not install a vision dependency

**Observed failure.** The first live photo-intake job stopped in83ms with zero usage rows, zero assets and no agent-run entry. A read-only execution of the owned photo decoder against the exact deployed image reproduced `ModuleNotFoundError: PIL`; the uploaded PNG matched its stored bytes/hash. No corrective provider retry was made during diagnosis.

**Five whys.** (1) New vision intake imports Pillow. (2) The Linux image did not contain that distribution. (3) Docker installs `-r requirements.txt -c requirements-lock.txt`, and Pillow was only in the constraint file. (4) The local environment already had it, so local vision tests passed. (5) **Deepest why: acceptance design** — the Linux smoke generated a mock SVG but did not exercise uploaded-image decoding.

**Repair and prevention.** Declare the existing exact Pillow12.3.0 pin as a direct requirement. The network-none Linux acceptance must decode an actual synthetic PNG through `_upload_images`, resize it and verify the JPEG output. Constraints pin dependency versions; they are not an install manifest. A second exposed contract gap is repaired: caught stage errors now persist job status `failed` with safe `stage_failed`, rather than misleading `finished`, and current failures present an explicit Retry question with a possible-paid-request warning. The web fallback may expose only the latest persisted escalation's offered Retry action. No stale-question resurrection or automatic retry is allowed.

**Local validation.**265 tests pass, including isolated PostgreSQL and actual background-job outcome/reset contracts; four ffmpeg-dependent tests are skipped locally. Corrected Linux image and root-owned live retry remain pending at this checkpoint.


## 2026-10-01 — Retry is not permission to choose the business brief

**Failure.** After photo decoding was fixed, live intake offered a completed campaign with assumed awareness/Instagram without a user answer. The driver still contained a legacy question-count shortcut and accepted new model-authored assumptions in ordinary intake. The displayed copy alone does not establish which path supplied the live assumptions; both source paths allowed the same undesirable result.

**Five whys.** (1) A complete context with assumptions was offered as ready. (2) Ordinary intake did not validate delegation. (3) A legacy two-question policy could separately invoke defaults. (4) Retry/failure turns were not distinguished from answered business questions under that policy. (5) **Deepest why: requirements drift** — an older “move ahead after a few questions” choice remained active after the user explicitly required the agent to ask for remaining details.

**Repair.** Remove automatic count-based delegation. Set ordinary assume_mode=false, reject new unsolicited assumptions, and require a narrow explicit user delegation before choosing campaign defaults. A supplied product remains mandatory, and claims remain unconfirmed. The regression exercises the actual driver from failed image decode through Retry, repeated yes/continue, the visible missing-goal/platform question, and finally the user's explicit answer. Full suite267 passes with four local ffmpeg skips. Existing live context must be corrected through ordinary user conversation; this fix does not rewrite historical user state.


## 2026-10-01 — Replay the API wire schema, and enforce QC at delivery

**Observed defect.** A live planner completed its first model call, then its tool continuation was rejected. The old diagnostic discarded the status/code/field. Independently, actual SDK3.22.1 serialization reproduced an invalid second-request key, `async_`, and unnecessary null fields. Two strict wire fixtures failed before alias-aware serialization and passed after it. The exact historical provider field remains unknown; no further paid request was used to diagnose it.

**Five whys.** (1) The second tool request contained a Python field name. (2) Response models were dumped with default aliases off. (3) Tool-loop tests accepted any outgoing fields. (4) Only the first request looked like the expected input contract. (5) **Deepest why: contract-test design** — a successful permissive mock response was treated as proof of provider request validity. The regression now checks the real SDK's second HTTP body and preserves explicit async:false. Known rejection metadata is narrowly allowlisted into the existing private agent log without raw provider prose.

**QC finding.** Hiding Deliver on a held report did not prevent typed yes/direct actions from assembling the AdCard. The server now re-derives QC clearance at parser, dispatch and assembly/recovery boundaries. Tests persist held, incorrectly labelled and missing reports, restart workspace state, and assert no delivery or provider work on every path; a cleared report still accepts natural yes. Full suite272 passes with four local ffmpeg skips. Root-owned live acceptance remains separate.


## 2026-10-01 — Sample provenance is separate from source tier

The live devrag service labelled samples with sample_data=true, while the client rejected only tier=seed. Fixture rows marked official/research/curated therefore passed both retrieval and existence checks. Source tier describes a kind of evidence; it does not prove the record is real. Live search and resolution now reject sample markers, including the marker added to the bundled resolver. Mock/cached samples remain explicitly available; fixture identity cannot override live execution. Four new actual-service/mock-HTTP contracts prove zero live sample hits/citations and preserve real unmarked results. Full suite276 passes with four local ffmpeg skips. No corpus expansion or paid verification was performed by this workstream.


## 2026-10-01 — Validate real-mode copy after a successful paid result

A shot board was generated and billed successfully, then failed while constructing its display envelope: the live billing note contributed two sentence endings after a one-sentence heading. Mock wording had only one, so the whole mocked journey missed the live-only validation failure. The shared live note is now a single truthful sentence. The driver regression uses actual MOCK_MEDIA=false branches and injected, network-denied media fixtures through delivery, including a restart at QC. It verifies all four planned media operations without a paid call.

A successful validated board now gets an owner-bound input-fingerprinted checkpoint before UI emission; only explicit Retry with identical inputs reuses it. Changed context invalidates reuse. Existing failed output is not automatically recovered from private logs. QC restart additionally restores exact accepted slot/asset pairs from its report, not merely a cleared label. Same-slot substituted assets remain unaccepted. Full native plus isolated PostgreSQL suite282 passes with four local ffmpeg skips. The remaining root-owned paid full-flow acceptance is separate.


## 2026-10-01 — Preserve existing product marks in generated defaults
The neutral style said to avoid any logo, contradicting the canon reference requirement to retain the photographed product's existing chest mark. The default now distinguishes added branding from existing markings. The fix is deliberately exact: only the old server neutral style and its known generated prefix are replaced before rendering, leaving custom text and historical board records intact. Actual outgoing-keyframe tests also compare the persisted effective prompt, so the visible generation record describes the request sent. Full suite287 passes with four local ffmpeg skips; real product fidelity still requires the root-owned paid image review.
