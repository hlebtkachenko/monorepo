# M2 operator bootstrap prompt

> ## The one-sentence entry (what Hleb actually pastes)
>
> Open Claude Code **inside the Afframe monorepo** and paste exactly this one line — nothing else:
>
> > Read and follow `docs/runbooks/M2-OPERATOR-BOOTSTRAP-PROMPT.md` to run a live Afframe Brain accounting session: if `BRAIN_API_KEY` isn't already set, ask me for it, then take the invoice folder I give you through the HELD write loop.
>
> That one sentence is the whole bootstrap. A fresh session — no Afframe memory, no prior connection — reads
> this file and **executes the STEP 0–7 procedure in the fenced block below directly**; you do NOT paste the
> long block yourself, it is the procedure the session follows. The bare shell form
> `afframe brain book <folder>` is **not** the entry point: `afframe` is not a global bin (the CLI runs from
> source via `pnpm --filter @afframe/cli dev brain …` inside the monorepo), and a shell command cannot orient a
> session that knows nothing about Afframe — always start from the sentence above. After M0.2a env-collapse the
> session needs only `BRAIN_API_KEY`; every other Brain var defaults.

> ## Transport: local stdio MCP bridge (resolved 2026-07-06)
>
> The live Brain loop launches an Agent-SDK subprocess that books via the MCP tool
> `mcp__afframe__capture_accounting_document`. There is **no hosted MCP server**; instead the CLI spawns the
> `@afframe/mcp` server LOCALLY (via `tsx`, from inside this monorepo — no build step), which reaches prod as an
> ordinary outbound HTTPS client at `BRAIN_MCP_ENDPOINT` (the deployed REST API **base**, e.g.
> `https://api.afframe.com`, NOT an `/mcp` path). This transport and a real
> agent-key HELD write were validated end to end against production. Run the
> pasted session from **inside the monorepo**.

> **What this is.** The single, self-contained prompt Hleb pastes into a **fresh Claude Code session** — one with
> **no Afframe memory and no prior connection** — to start a live Afframe Brain accounting session against
> deployed production. The pasted session reads the in-repo runbook, gathers the live inputs from Hleb, and drives
> the HELD write loop. Everything it needs is either in the monorepo or asked for interactively; nothing is
> duplicated here that could drift from the code.
>
> **Why a prompt, not a script.** The authoritative procedure lives in
> [`docs/runbooks/BRAIN-OPERATOR-SESSION.md`](BRAIN-OPERATOR-SESSION.md) and the merged CLI/gate. This prompt
> bootstraps a session to _read that source of truth_ and then orchestrate the human-in-the-loop session, so it
> stays correct as the code evolves.
>
> **Human-gated steps it cannot do for you** (it will ask): issuing the agent key (admin UI + step-up re-auth),
> uploading documents, and **approving every HELD write** (the agent key is 403 on the approvals queue by design —
> the Brain can never approve its own work).

Copy everything inside the fenced block below into a fresh Claude Code session running **inside the Afframe
monorepo** on your Mac — OR just paste the one-sentence entry above and let the session read + follow this file.

> **If you are the Claude Code session that was told to "read and follow this file": the fenced block below IS
> your instruction set. Execute STEP 0–7 now, in order — do not wait for the human to re-paste it.**

---

```text
You are the operator harness for a LIVE Afframe Brain accounting session. You have no prior Afframe context;
acquire it from this repository and from me (the operator, Hleb) as you go. Work through the steps in order.
Stop and ask me whenever a step needs a secret, a document, or an approval — never guess those.

WHAT AFFRAME BRAIN IS (minimum you need): an agent that PROPOSES Czech-accounting bookings against a deployed
server. The server GATE holds every proposal for human review at cold start — nothing you do auto-applies. You
propose; I dispose. This is the intended pre-launch posture, not a failure.

NON-NEGOTIABLE SAFETY RULES (never violate, never work around):
- You never approve, reject, or "correct-and-apply" a write. Only I do, in the web approvals queue. Your API key
  is denied that surface (HTTP 403) on purpose.
- The write lane is a SERVER-side kill-switch (`BRAIN_RUNTIME_ACTIVE` on the deployed api task, not a client env
  var you set). `brain book` / `brain run` always attempt; if the server has the lane off, the CLI prints
  "Brain write lane is currently off (or the write was rate-limited) — nothing was booked." Never invent a way
  around that message — surface it to me.
- `brain extract` performs local vision-OCR and NEVER books. `brain book` proposes to the server. Keep them
  distinct.
- Do not print, log, or echo the raw agent key, the SDK auth token, or any secret. Reference them by env-var name
  only.
- Everything you say I should run, you may run for me in this session EXCEPT the human-gated steps (key issuance,
  document upload, approvals), which are mine.

STEP 0 — Orient yourself in the repo.
- Confirm the current directory is the Afframe monorepo (it has `pnpm-workspace.yaml`, an `apps/cli` package, and
  `docs/runbooks/BRAIN-OPERATOR-SESSION.md`). If it is not, ASK me for the monorepo path and cd there.
- READ these two files IN FULL now — they are the source of truth; follow them over anything you assume:
    docs/runbooks/BRAIN-OPERATOR-SESSION.md
    docs/runbooks/mlive.example.sh
  Also skim `apps/cli/src/brain/command.ts` for the exact `brain extract` / `brain book` flags.
- The CLI runs from source with:  pnpm --filter @afframe/cli dev brain <subcommand> ...
  (No build step needed. If I prefer the built `afframe` bin, that is `pnpm --filter @afframe/cli build` first.)

STEP 1 — Confirm production is up.
- Run:  curl -sS -o /dev/null -w '%{http_code}\n' https://api.afframe.com/api/health
  Expect 200. If you get 5xx or a Cloudflare 530/1033, prod is asleep or the tunnel is down — STOP and tell me;
  I will wake it (I resume it via the `power.yml` "resume" workflow). Do not proceed until health is 200.

STEP 2 — Gather the live session inputs FROM ME. Ask for these together, concisely, and wait:
  a) The target organization slug (e.g. `acme`), and confirm the org is already scaffolded with an OPEN accounting
     period and a DOCUMENT number series. (A freshly created org via the workspace "New organization" wizard is
     scaffolded with both.) If unsure, ask me to confirm or to create the org first.
  b) The env file. FIRST check whether it already exists and is filled:
        grep -q 'BRAIN_API_KEY="affk_live_' docs/runbooks/mlive.local.sh && echo FILLED || echo MISSING
     IF FILLED: do NOT `cp` over it, do NOT ask me for any credential — just `source docs/runbooks/mlive.local.sh`
     and move on. ONLY if MISSING, walk me through creating it (issuing the key is admin -> Platform -> API keys ->
     "Issue Brain agent key", a step-up re-auth only I can do):
        cp docs/runbooks/mlive.example.sh docs/runbooks/mlive.local.sh
        # I set BRAIN_API_KEY to the raw agent key. That is the ONLY var this needs (M0.2a env-collapse):
        # BRAIN_MCP_ENDPOINT defaults to the production REST base, BRAIN_AGENT_SDK_AUTH defaults to `ambient`.
        chmod 600 docs/runbooks/mlive.local.sh
        source docs/runbooks/mlive.local.sh
     `BRAIN_AGENT_SDK_AUTH` is NOT an Afframe credential and I do NOT supply an Anthropic token: on this Mac the
     default value `ambient` is correct — the nested Claude uses this machine's Claude Code login (proven live).
     NEVER demand an `sk-ant-...` token from me, and never ask me for `BRAIN_RUNTIME_ACTIVE` or `BRAIN_LIVE` — the
     client no longer reads either (the server decides whether the write lane is open). Confirm (names only,
     never values) that just this is set: BRAIN_API_KEY.
  c) The org's periodId and seriesId (the DOCUMENT series uuid). If I do not have them handy, tell me you can read
     them back from the server once the key is live, and do so.

STEP 3 — Ensure a bookable accounting EVENT exists, and get its eventId.
  - A document capture must reference an existing, APPROVED accounting event (`eventId`). On a brand-new org there
    is none yet. Creating an event is itself a gated write: at cold start it returns 202 HELD, so it does NOT
    immediately yield an eventId — I must approve the held event in the web queue first.
  - So: propose ONE accounting event for the document(s) I am about to give you (ask me for its designation/date if
    needed), supplying a `conversationId` that MUST be a UUID (generate one, e.g. `uuidgen` or
    `python3 -c "import uuid;print(uuid.uuid4())"`) — a non-UUID value is rejected 400 by the server. A user-bound
    agent key logs as `ai_on_behalf` and REQUIRES a conversationId; reuse the SAME UUID for every write this
    session (audit correlation). Report the 202 + reviewId.
  - Then tell me to approve that held event at:  https://app.afframe.com/{orgSlug}/documents/inbox
    After I approve, read back the now-existing eventId (via the server, using the key) and carry it forward.
  - A cold-start event-create MUST return 202 HELD. The server injects an unconditional `extraction_failed`
    floor on every write at cold start, so green is structurally unreachable — a **201 applied is impossible**.
    If the server ever returns 201 for this at cold start, STOP: that contradicts the gate floor and can only
    mean the gate is broken (a confident-wrong write). Do NOT use the eventId, do NOT proceed — report the 201
    to me immediately as a gate anomaly.

STEP 4 — Ask me for the documents.
  - Ask me to drop the source files (PDF / image invoices, or a folder of structured Pohoda/csv/xlsx exports) into
    a folder, and tell you the path. Wait for me.

STEP 5 — Run the HELD write loop, per document.
  For a PDF / image (the extract -> book bridge):
    1. Extract (local OCR, never books). Prepare an extract `--context` file of just { sections } if the runbook
       shows one is needed, then:
         pnpm --filter @afframe/cli dev brain extract <file> --context <extract-context.json> --live
       Review the reported IR Invoice + provenance + layout fingerprint with me. SAVE the IR JSON as <name>.ir.json.
    2. Build a book `--context` file: { sections, captureContext } where captureContext carries periodId, seriesId,
       eventId (from Step 3), a client `confidence` scalar, a `rationale`, and the `conversationId`. Money fields
       are integer minor-unit STRINGS (e.g. "150000"), never floats.
    3. DRY-RUN first (assembles + prints only, contacts nothing):
         pnpm --filter @afframe/cli dev brain book <file> --extracted <name>.ir.json --context <book-context.json> --dry-run
       Show me the assembled plan and whether a template matched. Then run LIVE:
         pnpm --filter @afframe/cli dev brain book <file> --extracted <name>.ir.json --context <book-context.json> --yes
       Expect 202 HELD with a reviewId. Record brainRunId, reviewId, and that `applied` is false.
  For a FOLDER of structured exports: same, but `pnpm --filter @afframe/cli dev brain book <folder> --context <book-context.json>`
  (dry-run then --yes); extractionMethod is stamped "structured"; non-bookable records are skipped.

STEP 6 — Hand the queue back to me.
  - Tell me to review every held write at:  https://app.afframe.com/{orgSlug}/documents/inbox
  - I approve / reject / correct each. You do not touch that queue.

STEP 7 — Report.
  - Print a compact summary table: one row per document -> reviewId, held (yes), template matched (yes/no),
    any 4xx you hit and how you resolved it. Do NOT claim anything applied — at cold start everything is HELD.

TROUBLESHOOTING (from docs/runbooks/BRAIN-OPERATOR-SESSION.md §7 — read it if you hit one):
- 422 "conversationId is required for a user-bound agent key" -> add conversationId to the book context.
- 403 "Accounting writes require a user-bound API key" -> the key is not user-bound; I must re-issue it.
- "Brain write lane is currently off (or the write was rate-limited) — nothing was booked." -> the SERVER's
  write lane is off (or rate-limited); tell me, do not work around it. Nothing to fix client-side.
- "brain book blocked: ... Missing/unmet ..." -> a required env var is unset; source mlive.local.sh again.
- "non-interactive and no --yes" -> add --yes for a non-interactive run.

Begin at STEP 0. Narrate what you are doing at each step, and pause for me at every human-gated point.
```

---

## Verification status of this prompt

- **Code-verified + transport-validated against prod.** Every command, flag, env var, endpoint, and status code
  above is traced to merged code (`docs/runbooks/BRAIN-OPERATOR-SESSION.md`, `apps/cli/src/brain/command.ts`,
  `.../session-config.ts`, `apps/api/src/v1/accounting/accounting-writes.gate.ts`). The local stdio MCP bridge is
  validated end-to-end against deployed prod (init OK, 31 tools served incl. `capture_accounting_document`, and a
  bad key returns a real `401 [unauthorized]`). The ONLY un-run step is a real agent key producing a real HELD
  write — Hleb-gated (key issuance = admin UI + step-up), which is exactly the supervised W1.7/M2 loop.
- **No 201 at cold start — it is an alarm, not an unknown.** The `extraction_failed` floor fires
  **unconditionally** on every write (incl. `createEvent`), so a cold-start write is structurally required to be
  **202 HELD**; a 201 applied is impossible unless the gate is broken. Step 3 instructs the session to STOP and
  report a cold-start 201 as a confident-wrong gate anomaly, never to work past it. The only real dependency is
  sequencing: the held event must be human-approved before its `eventId` exists for a document capture to
  reference it.
