# Brain operator session (W1.6)

> **Who this is for.** Hleb, running a **live** Afframe Brain booking session from his Mac against the
> deployed accounting MCP endpoint, pushing a real org's documents through the **HELD write loop**. This is the
> operator counterpart to [`BRAIN-CC-HARNESS.md`](BRAIN-CC-HARNESS.md) (which documents the harness internals):
> this file is the exact "here is how you start a session and where the writes land" procedure.

The whole point of a cold-start session: **every write is HELD.** The Brain (an `actor_kind='agent'` API key)
can only _propose_ a capture. The server gate holds it, and you approve/correct it by hand in
[`/{orgSlug}/accounting/approvals`](#6-review-the-held-writes). The agent key is **denied** the review surface,
so it can never approve its own work.

Everything below is accurate to the merged code. The two entry commands are `afframe brain extract` and
`afframe brain book` (the `afframe` bin is `apps/cli`). `afframe brain run` is the single-invoice, JSON-inputs
path the harness scaffold uses; a real document goes through `extract` → `book`.

---

## 0. The write path in one picture

```
 PDF / image                                              a FOLDER of structured exports
     │                                                    (Pohoda dataPack XML / xlsx / csv)
     ▼                                                              │
 afframe brain extract <pdf>   ── LOCAL vision-OCR, NEVER books     │
     │  emits IR Invoice + provenance + layout fingerprint         │
     ▼  (save the IR as ir.json)                                    │
 afframe brain book <pdf> --extracted ir.json                afframe brain book <folder>
   extractionMethod = "ocr" (forced)                        extractionMethod = "structured"
     │                                                              │
     └──────────────────────────┬───────────────────────────────  ┘
                                 ▼
        capture_accounting_document  (proposed to the deployed MCP endpoint)
                                 ▼
        SERVER GATE  (apps/api — runGatedWrite, three-way AND)
          cold start ⇒ extraction_failed floor ⇒ HELD (202)
          shadow score recorded at serverGate.shadow (audit-only)
                                 ▼
        /{orgSlug}/accounting/approvals   ← Hleb reviews / approves / corrects
          (agent key is 403 here — cannot self-approve)
```

---

## 1. Prerequisites

Before a session runs live, all of these must be true:

1. **Production is deployed** and the REST API answers (`curl {BRAIN_MCP_ENDPOINT}/api/health` → 200).
   `BRAIN_MCP_ENDPOINT` is the deployed REST API **base URL**, e.g. `https://api.afframe.com` — NOT an `/mcp`
   path. The CLI itself runs a LOCAL stdio MCP bridge (`@afframe/mcp` via `tsx`) that talks to this base as an
   ordinary outbound HTTPS client; there is no hosted MCP server to reach.
2. **Run the CLI from inside the monorepo** (with dependencies installed). The bridge runs the `@afframe/mcp`
   TypeScript server directly under `tsx` — no build step — and resolves `apps/mcp/src/server.ts` +
   `apps/mcp/node_modules/.bin/tsx` by absolute path. (Override with `BRAIN_MCP_SERVER_JS` / `BRAIN_MCP_TSX_BIN`
   if you relocate them.)
3. **The write lane is ON.** The server admission controller rejects every accounting write with **429** unless
   the runtime kill-switch is active on the deployed api task. **[M0.2a]** the client no longer pre-checks this
   itself before opening a session — it always attempts, and a run against an off lane now surfaces as a clean
   lane-off message (see [§7](#7-troubleshooting)) instead of a client-side refusal. The server gate is
   unchanged and still fails closed OFF by default.
4. **The target org is scaffolded with accounting structure** — at minimum an open **accounting period** and a
   **DOCUMENT number series**. `brain book` does NOT resolve these; the operator supplies `periodId` /
   `seriesId` / `eventId` verbatim in the `--context` file (they name tenant-side rows, `NOT MCP-resolved`).
5. **A user-bound agent key is issued** for that org (next section).

---

## 2. Issue the agent key

Use the admin UI action, not a hand-written SQL insert.

1. Sign in to the admin app (`admin.afframe.com`) and open **Platform → API keys**
   (`apps/admin/app/(gated)/platform/api-keys`).
2. Click **Issue Brain agent key**. This is gated on the `admin:api_key.create` capability (owner/admin) **plus
   a fresh step-up re-auth** — minting a write-capable agent key forces `requireStepUpForAction`, so you will be
   bounced to `/auth/step-up` if your session is not stepped up.
3. Pick the **organization** and give the key a name (e.g. `Afframe Brain — Acme`), then **Issue key**.
4. **Copy the raw key immediately.** It is shown exactly once and never stored (only its sha256 `key_hash`
   lands in the row). Closing the dialog discards it permanently.

What the action guarantees (`apps/admin/.../api-keys/actions.ts` → `issueBrainAgentKey`):

- `actor_kind` is **HARDCODED to `'agent'`** — never the column's `'human'` default. An agent key may propose
  gated writes but is **denied** the held-write review surface (it can never approve its own writes).
- `workspace_id` is bound to the org's own immutable `organization.workspace_id` (set at scaffold time), never
  taken from input.
- The key is **user-bound**: `created_by_user_id` = the issuing operator, so the write has a responsible person.
  A capture with a key that is not user-bound is rejected **403** ("Accounting writes require a user-bound API
  key").

At capture time, a user-bound **agent** key logs as `actor_kind='ai_on_behalf'` in the audit trail, and an
`ai_on_behalf` row **requires a `conversationId` on every capture** (see [§4](#4-supplying-conversationid) — a
missing one is now a clean **422**, not a 500).

---

## 3. Environment

**[M0.2a — env-collapse]** `brain extract --live`, `brain book --live`, and `brain run` need ONLY
`BRAIN_API_KEY` pasted in. `resolveBrainEnv` (`apps/cli/src/brain/env.ts`) is the single source of truth for
every default; names below are taken verbatim from the code — do not invent flags.

| Env var                | Read by                                         | What it is                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BRAIN_API_KEY`        | `resolveBrainEnv` (`apps/cli/src/brain/env.ts`) | The **raw agent key** issued in §2. Resolves org + workspace + responsible user server-side from the principal; never a tool input. **No default — the one required paste.**                                                                                                                                                                                                                                                            |
| `BRAIN_MCP_ENDPOINT`   | same                                            | The deployed REST API **base URL** (e.g. `https://api.afframe.com`) — NOT an `/mcp` path. The CLI spawns a LOCAL stdio MCP bridge (`@afframe/mcp` via `tsx`) that reaches prod at this base (its `AFFRAME_API_BASE`). **Defaults to the production base when unset.** Override only for staging / a local container.                                                                                                                    |
| `BRAIN_AGENT_SDK_AUTH` | same                                            | Auth for the NESTED Claude subprocess — **NOT an Afframe credential. Defaults to the literal `"ambient"` when unset.** On your own Mac where Claude Code is logged in, `ambient` (any non-`sk-` value) is left to the nested Claude's own credential resolution, which uses this machine's Claude Code login — **no Anthropic token needed** (proven live 2026-07-07). Supply a real `sk-ant-…` only when running with no Claude login. |

`BRAIN_RUNTIME_ACTIVE` and `BRAIN_LIVE` are **no longer read by the client at all** (dropped M0.2a — see
[§7](#7-troubleshooting)). `BRAIN_RUNTIME_ACTIVE` still exists as the **SERVER's** deploy-time kill-switch
(`apps/api/src/v1/accounting/admission.singleton.ts`); that gate is unchanged and still fails closed — the
client simply no longer pre-checks it before attempting a run.

Notes on scope:

- **`brain extract --live`** checks only `BRAIN_API_KEY` (`resolveBrainEnv`). It never required
  `BRAIN_RUNTIME_ACTIVE` / `BRAIN_LIVE` — extract never books, so it was never behind the write-lane
  kill-switch. A missing key fails loud: `brain extract blocked: missing BRAIN_API_KEY`.
- **`brain book --live` / `brain run`** go through `runLiveBrainSession`, which requires `BRAIN_API_KEY` (no
  default) plus the two now-defaulted values (`BRAIN_MCP_ENDPOINT`, `BRAIN_AGENT_SDK_AUTH`) resolved via
  `resolveBrainEnv` before any launcher runs. An unmet `BRAIN_API_KEY` throws `BrainHarnessNotWiredError` and
  the CLI prints `brain book blocked: <what is missing>` and exits non-zero. The write lane itself is decided
  by the SERVER, not this gate — see the lane-off note above.
- `BRAIN_ACCOUNTING_POLICY` / `BRAIN_EXTRACT_POLICY` are **not env vars** — they are the pinned in-code sandbox
  policies (`packages/brain`, `apps/cli/.../extract-config.ts`). You do not set them.

### `mlive.example.sh` (committed template)

A secret-free example lives next to this runbook at **[`mlive.example.sh`](mlive.example.sh)**. It sources your
real values from a **gitignored local file** so no secret is ever committed:

```bash
cp docs/runbooks/mlive.example.sh docs/runbooks/mlive.local.sh
# edit docs/runbooks/mlive.local.sh — paste the raw agent key + your creds
source docs/runbooks/mlive.local.sh
```

`docs/runbooks/mlive.local.sh` is **gitignored** (`.gitignore` → `mlive.local.sh`). Never commit it, never
paste a real key into `mlive.example.sh`. The example uses obvious placeholders only.

---

## 4. Run a session

Both paths **print the assembled plan first** (the verbatim `captureRequest` body the live session would embed),
then run the shared inspect → confirm → book tail. Always dry-run once, then run live.

### 4a. A PDF / image (the OCR extract → book bridge)

**Step 1 — extract (LOCAL vision-OCR, never books).** The file is fed to the model as an image/document
**content block**, not via a `Read` tool, and the extract sandbox allows only the OCR-template read/propose
pair. `--context` here is just `{ sections }` (the login-pack safety spine; extract needs no tenancy).

```bash
afframe brain extract ./acme-invoice.pdf --context ./extract-context.json --live
```

This reports an **IR Invoice + field-level provenance + a layout fingerprint**. Review it, then **save the IR
Invoice JSON** (an object with `"record_type": "invoice"`) as `ir.json`.

**Step 2 — book the PDF against its IR.** A single PDF/image argument routes through the bridge; `--extracted`
names the IR file. `extractionMethod` is **forced to `"ocr"`** on this path — a PDF can never be mislabeled
`"structured"`. `--context` here is `{ sections, captureContext }`.

```bash
# dry-run first — assembles + prints only, no creds, contacts nothing
afframe brain book ./acme-invoice.pdf --extracted ./ir.json --context ./book-context.json --dry-run

# then live (write lane must be ON) — --yes skips the interactive confirm for a non-interactive operator
afframe brain book ./acme-invoice.pdf --extracted ./ir.json --context ./book-context.json --yes
```

The dry-run prints whether a **template** matched: if none matched (or the server can't tie it to a **confirmed**
template), the server **fail-closes this OCR capture to HELD** via the `unverified_template` leg (#554).

### 4b. A folder of structured exports

A directory argument keeps the structured flow: `book` walks the folder, parses every leaf (csv / xlsx / Pohoda
dataPack XML) into IR, maps each **bookable** record to a capture, and assembles one plan per record.
`extractionMethod` is stamped **`"structured"`**. Non-booking sources (GLEntry / Attachment) are skipped;
unwired formats (isdoc / pdf / native Pohoda backup / zip / unknown) are reported, not booked.

```bash
# dry-run first
afframe brain book ./acme-exports/ --context ./book-context.json --dry-run

# then live
afframe brain book ./acme-exports/ --context ./book-context.json --yes
```

### The `--context` files

All operator JSON files fail loud at the boundary: a missing required key names the flag + the exact key list,
and any extra key (e.g. a `policy` widening attempt) is **dropped**, never carried through. Money fields are
carried as integer minor-unit **strings** (e.g. `"150000"`), reconstructed as `bigint` — never a float.

- **extract `--context`** → `{ sections }` only.
- **book `--context`** → `{ sections, captureContext }`.

`captureContext` (shape = `IrToCaptureContext`, `packages/intake/src/ir-to-capture.ts`) carries the
operator-supplied uuids + the server-gate envelope:

The `constitution` is NOT supplied here: the CLI ASSEMBLES it VERBATIM from the LOCKED
`packages/brain/.brain/constitution.md` at the operator-JSON boundary (M0.2a′), so it can never be
hand-copied stale or dropped. You supply only the remaining spine sections; a missing/blank one fails
closed (the assembler refuses to boot a login pack with a hole in its safety framing).

```jsonc
{
  "sections": {
    // constitution is auto-assembled from .brain/constitution.md — do NOT paste it here
    "kb": { "id": "…", "version": "…" }, // which KB snapshot the session is grounded on
    "lawSummary": "…", // the accounting-law digest the session reasons against
    "confidenceProtocol": "…", // how the SERVER gate scores (the model never self-scores)
    "escalationPolicy": "…", // when + how to route to a human
  },
  "captureContext": {
    "periodId": "…uuid…", // open accounting period (NOT MCP-resolved)
    "seriesId": "…uuid…", // DOCUMENT number series (NOT MCP-resolved)
    "eventId": "…uuid…", // accounting-event uuid the line hangs off
    "confidence": 0.5, // client scalar — NECESSARY, never sufficient
    "rationale": "…", // why this booking
    "conversationId": "…uuid…", // REQUIRED for the agent key, MUST be a UUID (see §4 below)
    // templateId / signals / extractionMethod are set by the bridge, not here
  },
}
```

### Supplying `conversationId`

The agent key logs as `actor_kind='ai_on_behalf'`, which **requires a `conversationId` on every capture** — omit
it and the server returns **422** ("conversationId is required for a user-bound agent key"). **It MUST be a
UUID** (`conversation_id` is a `uuid` column; the server schema is `z.string().uuid()`) — a non-UUID value
(e.g. `m2-2026-07-07-01`) is rejected **400 "Validation failed"**, not accepted. Generate one with `uuidgen`
or `python3 -c "import uuid;print(uuid.uuid4())"` and reuse the SAME UUID for every write in a session. It is
**audit correlation only** (session_id ↔ conversation_id / brain_run_id). Supply it in the `captureContext`
block of the book `--context` file (`conversationId` above). The adapter emits it into the capture request only
when present, so a session without one is a fail-loud 422, not a silent 500.

> **Contract drift (found live 2026-07-07):** the generated MCP tool schema declares `conversationId` as a
> plain `z.string()` (the codegen drops the `.uuid()` format), while the server enforces `z.string().uuid()`.
> Always pass a UUID until the codegen fidelity is fixed (tracked as a follow-up).

---

## 5. What happens on a live run

- **Every write is HELD at cold start.** The server gate (`runGatedWrite`, `apps/api/.../accounting-writes.gate.ts`)
  requires a **three-way AND** to auto-apply — client `confidence ≥ threshold` **and** the server veto does not
  hold **and** the server score is green. At cold start the evidence score sits on the `extraction_failed`
  floor, so **green is structurally unreachable → every write returns `202 held`** with a `reviewId`. Nothing
  auto-applies. This is the intended pre-launch posture.
- **The shadow score is recorded.** Since W1.5 (#572, just merged), each capture persists a **second, pure**
  scoring pass at `serverGate.shadow` (jsonb, audit-only, no migration). It is telemetry for the M3 calibration
  refit and is **never** read for the decision — the enforced score keeps its cold-start floor. You do not act
  on it; just know it is being recorded on every capture.
- **The OCR template basis is screened** for an agent key: an OCR capture with no confirmed template basis fires
  `unverified_template` and a found-but-unconfirmed template fires `novel_template` — both force the score to
  HELD. Server-derived and fail-closed; a client can neither forge nor omit past them.

The CLI prints the run result JSON per entry (`brainRunId`, `applied`, `serverGate`). At cold start `applied` is
`false` for everything.

---

## 6. Review the HELD writes

Held writes are the **human master gate**, and only a human (a member with the org web session) can resolve
them. Open the org web app:

```
https://app.afframe.com/{orgSlug}/accounting/approvals
```

(route: `apps/web/app/[orgSlug]/accounting/approvals/page.tsx`, "Ke schválení"). Each row exposes the full
original payload; you **approve, reject, or correct** it via the `resolveHeldWrite` Server Action (a web
session, not the API).

The agent key **cannot** reach this queue: `HeldWritesController` is class-annotated `@RequireHumanActor()`, so
an `agent`-actor key is rejected **403** on both `list` and `resolve`. There is no path for the Brain to approve
its own write.

---

## 7. Troubleshooting

The real errors seen wiring this up, and what each means:

| Symptom                                                                                   | Cause                                                                                                                                                                                                                                                                   | Fix                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **422** `conversationId is required for a user-bound agent key`                           | The agent key stamps `ai_on_behalf`, which requires a `conversationId`, and the capture omitted it. (Formerly a 500 deep in the write path; now surfaced cleanly at the request boundary.)                                                                              | Add `conversationId` to the `captureContext` block of the book `--context` file.                                                                                                         |
| **403** `Accounting writes require a user-bound API key (responsible person)`             | The API key has no bound user (`principal.userId === null`).                                                                                                                                                                                                            | Re-issue the key via **Issue Brain agent key** — it binds `created_by_user_id`. Don't hand-mint keys.                                                                                    |
| `Brain write lane is currently off (or the write was rate-limited) — nothing was booked.` | **[M0.2a]** The server admission controller refused the write (kill-switch inactive, per-org concurrency cap, or per-key throttler — all render as `429 rate_limited`). The CLI now prints this clean sentence instead of the raw tool-result text; nothing was booked. | Ask an operator to turn the SERVER's write lane ON (`BRAIN_RUNTIME_ACTIVE=1` on the deployed api task), or retry shortly if it's a concurrency/throttle cap. Nothing to fix client-side. |
| `brain book blocked: … Missing/unmet: env BRAIN_API_KEY, …`                               | `runLiveBrainSession`'s creds gate is unmet — `BRAIN_API_KEY` has no default (M0.2a collapsed the other four vars).                                                                                                                                                     | `source docs/runbooks/mlive.local.sh` and confirm `BRAIN_API_KEY` is set.                                                                                                                |
| `brain extract blocked: missing BRAIN_API_KEY`                                            | Extract's one required cred is unmet.                                                                                                                                                                                                                                   | Set `BRAIN_API_KEY`.                                                                                                                                                                     |
| `brain book: non-interactive and no --yes — refusing to run live without confirmation.`   | A `--live` run in a non-TTY with no `--yes`.                                                                                                                                                                                                                            | Add `--yes` for a non-interactive operator, or run in a TTY and answer the `[y/N]` prompt.                                                                                               |

A **clean 422** (not a 500) on a missing `conversationId` is the expected, correct behavior — the invariant is
unchanged; only its transport moved to a 4xx at the request boundary.

---

## Cross-references

- [`BRAIN-CC-HARNESS.md`](BRAIN-CC-HARNESS.md) — the harness internals (`planBrainDryRun` / `runLiveBrainSession`,
  the sandbox, the dry-run inspector).
- `apps/cli/src/brain/command.ts` — the `brain extract` / `brain book` / `brain run` subcommands + flags.
- `apps/api/src/v1/accounting/accounting-writes.gate.ts` — the server three-way-AND gate + the 422/403/429 legs.
- `.brain/constitution.md` — the human-authorship-only invariant (the agent proposes and gates, never commits).
