# Afframe Brain: Technical Reference (A to Z)

The **debug-level** companion to [`README.md`](README.md) (the one-page index). This
file is for an engineer or agent with **no prior Afframe context** who needs to understand, explain, and
**troubleshoot** the Brain end to end. File and symbol citations point to the
canonical code. Line numbers are snapshot hints and can drift, so verify them
with CodeGraph before changing behavior. This document was reconstructed from
current code, not older planning notes.

Contents: 0. [Orientation + an end-to-end trace](#0-orientation)

1. [How a live session runs (transport, CLI, sandbox)](#1-how-a-live-session-runs)
2. [Auth, tenancy, and the API surface](#2-auth-tenancy-and-the-api-surface)
3. [The server write gate + admission](#3-the-server-write-gate--admission)
4. [Confidence model (how a booking is scored)](#4-confidence-model)
5. [Data model, migrations, tenant isolation](#5-data-model-migrations-tenant-isolation)
6. [Learning, OCR templates, and the constitution](#6-learning-ocr-templates-and-the-constitution)
7. [Debugging playbook (symptom → cause → file)](#7-debugging-playbook)
8. [Real vs aspirational (accuracy ledger)](#8-real-vs-aspirational)
9. [The two thresholds — do not confuse them](#9-the-two-thresholds--do-not-confuse-them)
10. [File map — where each Brain concern lives](#10-file-map--where-each-brain-concern-lives)

---

## 0. Orientation

**Mental model.** Brain v1 is an **unprivileged external client**. There is no Brain server. An operator's
Claude Code session runs a CLI (`afframe brain …`) that spawns a **nested, sandboxed** Agent-SDK session;
that nested session talks to a **local stdio MCP bridge**; the bridge is an ordinary HTTPS client of the
**deployed REST API**; the API's **server-side write gate** decides applied-vs-held; a **human** approves.
The Brain can only _propose_. At the current cold-start posture, **every write is HELD** — that is by design,
not a bug.

**End-to-end trace of one document capture** (follow the section links for detail):

```
operator Claude Code
  └─ afframe brain book <pdf> --extracted ir.json --context ctx.json --yes   (§1)
       └─ runLiveBrainSession: BRAIN_API_KEY creds gate (M0.2a: the rest default)  (§1.2)
            └─ nested query()  →  spawns  tsx apps/mcp/src/server.ts          (§1.1)
                 └─ model calls  mcp__afframe__capture_accounting_document
                      └─ bridge → HTTPS → POST /v1/accounting/documents        (§2.6)
                           └─ ApiKeyGuard: Bearer→hash→principal, scope, actor (§2.1-2.3)
                                └─ runGatedWrite (ONE withOrganization tx)      (§3.1)
                                     ├─ admission.acquire (kill-switch, caps)   (§3.5)
                                     ├─ writeToolCallLog (output_json=NULL)     (§5.3)
                                     ├─ three-way AND: confidence·veto·green    (§3.2)
                                     │    cold start ⇒ extraction_failed floor  (§3.3 / §4.5)
                                     │    ⇒ cRaw=0, isGreen=false ⇒ autoApply=false
                                     ├─ buildShadowScore (audit-only)           (§3.6 / §4)
                                     └─ updateToolCallLogOutput status=held      (§3.7)
                      ← 202 { status:"held", reviewId }
  ← operator approves at /{orgSlug}/accounting/approvals   (human-only, agent key 403)   (§2.2)
```

Everything below expands each hop.

---

## 1. How a live session runs

_(transport, CLI, sandbox)_

### 1.1 The process chain

Three commander subcommands are registered by `registerBrainCommand` (`apps/cli/src/brain/command.ts:38-216`):
`brain run`, `brain book`, `brain extract`.

For **run/book** the live path funnels through `runPlanLive` (`command.ts:388-409`), which lazy-imports the
SDK launcher and calls `runLiveBrainSession` (`packages/intake/src/harness/brain-cc-harness.ts:300-348`),
injecting `sdkAgentSessionLauncher`. After the creds gate (§1.2) it delegates to `launcher.launch(...)`.

`sdkAgentSessionLauncher.launch` (`apps/cli/src/brain/sdk-launcher.ts:128-181`) is the **only** file importing
`@anthropic-ai/claude-agent-sdk` (`sdk-launcher.ts:20-25`); it lives in `apps/cli` (`private:true`) so the SDK
never enters a published artifact. It builds `queryOptions` via `buildBrainQueryOptions` + `resolveMcpBridge()`
and drives a **nested** `query({ prompt, options })` (`sdk-launcher.ts:138-145`).

`query()` spawns the **local stdio MCP bridge** from the `mcpServers` descriptor
(`session-config.ts:65-75,100-108`): `type:"stdio"`, `command`=the `tsx` bin, `args`=`[apps/mcp/src/server.ts]`,
`env={AFFRAME_API_KEY, AFFRAME_API_BASE}`, `alwaysLoad:true`. The MCP server (`apps/mcp/src/server.ts:27-38`)
registers the codegen'd tools over a `StdioServerTransport`; `buildClient` (`apps/mcp/src/client.ts:17-30`)
reads `AFFRAME_API_KEY` (required — `process.exit(1)` if missing) + optional `AFFRAME_API_BASE`, and builds an
`@afframe/sdk` client that speaks ordinary outbound HTTPS to the deployed REST API. So the chain is
`query()` → tsx subprocess (`@afframe/mcp` **source**) → REST. Fargate is only the server.

**Why source via tsx, not `dist`** (`sdk-launcher.ts:63-72`): the built `dist/server.js` has ~95 extensionless
relative ESM imports, so `node dist/server.js` throws `ERR_MODULE_NOT_FOUND`. Running the TS entrypoint under
`tsx` sidesteps that (no build step). Paths are resolved absolute from `import.meta.url`
(`repoRoot = ../../../../`, `sdk-launcher.ts:75-79`) because the SDK's `McpStdioServerConfig` has no `cwd`.
Override with `BRAIN_MCP_SERVER_JS` / `BRAIN_MCP_TSX_BIN`; missing either → fail loud (`sdk-launcher.ts:84-90`).

> The `query()` call + message walk are self-declared **UNTESTED-LIVE** in code (`sdk-launcher.ts:12-15`); only
> exercised against a real Agent-SDK session. The pure halves (`session-config.ts`, `extract-config.ts`) are
> unit-tested. (Live-confirmed end to end on prod 2026-07-07 via `brain run --live` → 202 HELD.)

### 1.2 Env vars per command + the exact "blocked" messages

**[M0.2a — env-collapse]** A fresh session needs ONLY `BRAIN_API_KEY` pasted in. `resolveBrainEnv`
(`apps/cli/src/brain/env.ts`) defaults everything else: `BRAIN_MCP_ENDPOINT` → the production REST base
(`https://api.afframe.com`) when unset, `BRAIN_AGENT_SDK_AUTH` → the literal `"ambient"` when unset.

Canonical names the harness gate still checks: `BRAIN_HARNESS_REQUIRED_ENV` (`brain-cc-harness.ts`):
`BRAIN_MCP_ENDPOINT` (the deployed **REST base URL** — the var name is legacy, its meaning is the REST base),
`BRAIN_API_KEY`, `BRAIN_AGENT_SDK_AUTH`. `BRAIN_RUNTIME_ACTIVE` and `BRAIN_LIVE` are **no longer part of this
list** — M0.2a dropped the redundant client-side pre-block on those two (a duplicate of the SERVER's real
admission authority, `apps/api/src/v1/accounting/admission.singleton.ts`, which is unchanged and still fails
closed on its own kill-switch regardless of the client).

- **run / book** (`runLiveBrainSession`): `apps/cli`'s `readEnv` resolves the 3 required names from the
  already-defaulted `BrainEnv`, so only an unset `BRAIN_API_KEY` (no default) can leave one falsy. Any miss →
  `BrainHarnessNotWiredError`; `command.ts` prints `` `${command} blocked: ${msg}` `` + exit 1. An
  admission-refused live run (write lane off, concurrency cap, or per-key throttle — all `429 rate_limited`)
  is NOT a client-side block: it comes back as an ordinary result that `renderLiveResult`
  (`session-config.ts`) renders as the clean sentence `"Brain write lane is currently off (or the write was
rate-limited) — nothing was booked."` instead of the raw tool-result text.
- **extract**: reads only `BRAIN_API_KEY` (`command.ts`, via `resolveBrainEnv`) — never required
  `BRAIN_RUNTIME_ACTIVE`/`BRAIN_LIVE` (extract never books). Missing → `brain extract blocked: missing
BRAIN_API_KEY`.

**`buildBrainSessionEnv` and the `ambient` behavior** (`session-config.ts`): it copies every defined string
from `process.env`, then sets `ANTHROPIC_API_KEY = token` **only if** `token.startsWith("sk-")` (`token` =
the resolved `BRAIN_AGENT_SDK_AUTH`). A non-`sk-` value (e.g. the literal `ambient`, now the M0.2a default) is
deliberately **not** force-fed as an API key — it is left to the subprocess's own credential resolution, so
the nested `query()` authenticates off the operator's logged-in Claude Code session. **This is why on the
operator's own Mac no Anthropic token is needed** — the `ambient` default is correct out of the box.

### 1.3 The two lanes

Both share `buildQueryOptions` (`session-config.ts:90-112`): same MCP descriptor, `permissionMode:"default"`,
`settingSources:[]` (no CLAUDE.md/project config leaks in). Only the login pack differs.

- **BOOK/RUN lane** — policy `BRAIN_ACCOUNTING_POLICY` (`sandbox.ts:162-171`): `allowedMcpTools[afframe]` = the 5
  writes (`create_accounting_event`, `capture_accounting_document`, `create_accounting_posting`,
  `create_feedback`, `classify_accounting_event`) + 14 reads. `resolve_accounting_held_write` +
  `list_accounting_held_writes` are absent → denied (also server-side 403 for the agent key). Kickoff
  (`session-config.ts:133-149`) pins `get_structure` → `list_accounting_number_series` →
  `capture_accounting_document` embedding `plan.captureRequest` **verbatim**.
- **EXTRACT lane** — policy `BRAIN_EXTRACT_POLICY` (`extract-config.ts:70-76`): `allowedMcpTools[afframe]` =
  exactly `["list_ocr_templates","create_ocr_template"]`; every write + `confirm_ocr_template` denied. The
  document is fed as a **content block, not a Read tool** — the CLI reads the bytes in trusted code
  (`command.ts:170-175` → `toDocumentBlock`) and yields one user message with an inline base64 image/PDF block
  (`sdk-launcher.ts:227-261`). It **NEVER books**.

### 1.4 The three sandbox layers + the shadowing caveat

Three independent layers (`sdk-launcher.ts:51-60`): (1) login-pack **`disallowedTools`** strips the exfil/self-mod
built-ins from context (`Bash, WebFetch, WebSearch, Write, Edit, NotebookEdit, Read, Glob, Grep, Task, Agent` —
`sandbox.ts:21-33`); (2) **`allowedTools`** exact-name allowlist; (3) **`canUseTool`** programmatic default-deny
(`makeSandboxGate`, `sdk-launcher.ts:94-104`).

**Caveat (verified from code):** the SDK consults `canUseTool` **only for permission-requiring calls** — a tool
auto-approved by a bare `allowedTools` entry never reaches layer 3 (`sdk-launcher.ts:56-60`). So layer 3 is
belt-and-braces, shadowed for allowlisted tools. It is safe **only because** `allowedTools` and `canUseTool` are
single-sourced from the same policy (`session-config.ts:12-15,97-99`); if a tool were ever added to bare
`allowedTools` without the policy, `canUseTool` would silently never re-check it. (The literal
`CLAUDE_SDK_CAN_USE_TOOL_SHADOWED` string is the SDK's **runtime warning**, not a repo flag — grep finds it
nowhere in the tree.)

### 1.5 dry-run vs live + the operator context files

- `brain run`: `--dry-run` prints the plan (no creds); otherwise live. **No `--live` flag** — live is "not
  `--dry-run`".
- `brain book`: `--dry-run` prints only; otherwise requires TTY `[y/N]` confirmation or `--yes`
  (`command.ts:441-458`). _(Help text mentions "`--live`" but no such option is registered on `book` —
  `command.ts:72` vs `:83-99`. Harmless help drift.)_
- `brain extract`: has **both** `--dry-run` and `--live`; runs live only when `opts.live && !opts.dryRun`.

`captureContext` (`IrToCaptureContext`, `ir-to-capture.ts:57-67`): `periodId`/`seriesId`/`eventId` are **operator-
supplied verbatim, NOT MCP-resolved**. `conversationId` **must be a UUID** (`CONVERSATION_ID = z.string().uuid()`
— `packages/shared/src/api/accounting-writes.ts:319-321`). Money fields are integer minor-unit **strings**,
reconstructed to `bigint` by `reviveMinorBigints` keyed on the `_minor` suffix (`command.ts:235-249`) — this is
why `brain run --inputs` no longer truncates large money (JSON has no bigint literal).

---

## 2. Auth, tenancy, and the API surface

### 2.1 API-key auth flow + the 401 conditions

Raw key = `affk_live_` + base64url(randomBytes(32)) (43 chars); stored as **sha256 hex** in `api_key.key_hash`,
with a 4-char display `prefix` (`packages/auth/src/tokens/api-key.ts:21-46,55-57`). `ApiKeyGuard.canActivate`
(`apps/api/src/auth/api-key.guard.ts:43-58`) requires `Bearer `, then `verifyApiKey`
(`packages/auth/src/api-key-verifier.ts:44-100`). **401** when: no `Bearer` header (`"Missing API key"`); or
`verifyApiKey` → null — key lacks `affk_live_` prefix, no row matches `key_hash`, `revoked_at !== null`, or
`expires_at <= now()` (`api-key-verifier.ts:47,66-71`). Lookup runs under `withAdminBypass` (cross-org by hash);
`last_used_at` is a best-effort separate tx (never rejects a valid key). Principal =
`{ userId (nullable), organizationId, workspaceId, scopes, actorKind }` (`:14-29,90-99`).

### 2.2 actor_kind, ai_on_behalf, RequireHumanActor

`api_key.actor_kind` is `text` CHECK `{human, agent}`, **NOT NULL default `'human'`** (`schema/api_key.ts:47-49`).
The verifier narrows fail-safe: only the exact string `"human"` → `human`; anything else → `agent`
(`api-key-verifier.ts:98`).

At **capture time** the audit actor is `ai_on_behalf` if the key is `agent` **OR** the client supplied a
`conversationId`; only a bare human key with no conversation stamps `human`
(`accounting-writes.gate.ts:214-217`). An `ai_on_behalf` audit row requires **both** `userId` + `conversationId`
(`packages/db/src/audit/write-log.ts:228-234`); the gate pre-checks it → **422** "conversationId is required for a
user-bound agent key" (`gate.ts:229-233`).

`@RequireHumanActor()` (`apps/api/src/auth/require-human-actor.decorator.ts`) → guard throws **403** when
`actorKind !== "human"` (`api-key.guard.ts:67-80`). It is class-level on `HeldWritesController`
(`held-writes.controller.ts:84`), so an agent (Brain) key is 403 on **both** `GET held-writes` and
`POST held-writes/:id/resolve` — it can never list or approve the review queue. A second backstop: resolve also
rejects author == approver (`held-writes.controller.ts:206-215`).

### 2.3 Scopes

`@RequireScopes(...)` → `enforceScopes` (`api-key.guard.ts:86-107`): empty required list passes; a key with
**empty scopes** is a legacy full-access key (allowed with a warning; "flips to deny once issued keys carry
scopes"); otherwise any missing scope → **403** "API key is missing required scope(s): …". `accounting:write`
is on all 3 writes (`accounting-writes.controller.ts:71,120,227`) + OCR create/refine/confirm
(`ocr-templates.controller.ts:175,220,267`). Reads carry no scope.

### 2.4 Tenancy injection (never from the body)

Org is **always** from the principal. Writes wrap the domain call in `withOrganization(orgId, userId, tx)`
(`gate.ts:242-245`); OCR endpoints are workspace-scoped via `withWorkspace(workspaceId, …)`
(`ocr-templates.controller.ts:160,191,249,286`). `withOrganization` (`packages/db/src/tenancy.ts:221-253`) opens
a tx and sets, via transaction-scoped `set_config(name, value, true)` (pgBouncer-safe, no bare `SET`):
`app.organization_id`, `app.user_id`, and derives+sets `app.workspace_id` from `organization.workspace_id`
inside the same tx (throws if the org row is absent). Raw `db.*` outside `packages/db/src/` is ESLint-blocked.
Invariants: I1 (tenant from key, not body), I2 (never `withAdminBypass` on a v1 write — it is used only for the
key lookup + admin actions), I3 (audit `user_id` = the responsible person).

### 2.5 Key issuance — admin action vs operator raw-insert

`issueBrainAgentKey` (`apps/admin/app/(gated)/platform/api-keys/actions.ts:92-152`): gated by
`requireAdminCapability("admin:api_key.create")` **then** `requireStepUpForAction` (a fresh passkey re-auth),
both **before** the try so the step-up `NEXT_REDIRECT` escapes uncaught. `actor_kind` is **HARDCODED `"agent"`**
(`:125`) — the single load-bearing line: the column defaults to `'human'`, and a human-actor Brain key would pass
`@RequireHumanActor` and become a live self-approval lane. `workspace_id` comes from the org's immutable
`organization.workspace_id`; the raw key is returned once, only `key_hash` persists.

The **operator DB raw-insert** path (used to mint a key without the admin UI, e.g. from a script/bastion) must
set `actor_kind='agent'` + `created_by_user_id` explicitly, reproducing `generateRawApiKey()` (raw + sha256
`key_hash` + prefix). Omitting `actor_kind` inherits the `'human'` default → a self-approval-capable key. Prefer
the admin action; the raw path is documented but there is no checked-in SQL script for it.

### 2.6 The Brain-callable API surface

All under `@UseGuards(ApiKeyGuard)`. Agent (Brain) key can call: **all 12 reads** (`accounting.controller.ts` —
journal, ledger, open-items, saldokonto, the 6 statutory outputs, statement-layout, number-series, plus
`POST classify` HttpCode 200); the **3 gated writes** — `POST /v1/accounting/events` (`:70`),
`POST /v1/accounting/documents` (`:119`), `POST /v1/accounting/postings` (`:226`), each `accounting:write` +
`runGatedWrite`; and **OCR list/create/refine** (`GET/POST ocr-templates`, `PUT ocr-templates/:id`). It is **403**
on: `held-writes` list/resolve and `POST ocr-templates/:id/confirm` (all `@RequireHumanActor`).

---

## 3. The server write gate + admission

### 3.1 runGatedWrite step order

Entry `runGatedWrite(opts)` → `runGatedWriteWithSeams(opts, accountingAdmission, evaluateEvidence)`
(`apps/api/src/v1/accounting/accounting-writes.gate.ts:143-151`) — the production entry hard-wires the admission +
scorer seams so no caller can substitute a permissive scorer. Ordered steps:

1. Idempotency-Key present + ≤255 chars, else `ValidationError` → **422** (`:170-174`).
2. `principal.userId === null` → `ForbiddenError` → **403** (`:175-179`).
3. **Admission acquired BEFORE any tx** — `admission.acquire(orgId)`; rejection → `RateLimitedError` → **429**
   (`:187-199`).
4. `payloadHash = canonicalHash(body)` (sorted-key SHA-256); coarse `amountHold` vs `ALWAYS_HOLD_AMOUNT`
   (`:202-209`).
5. `actorKind` derivation (`:214-217`); agent key without `conversationId` → **422** (`:229-233`).
6. `withOrganization(orgId, userId, tx)` — **ONE** tx wraps the audit row + domain write (atomic) (`:242-399`).
7. `writeToolCallLog` with `output_json = NULL`; on replay → conflict/replay handling (`:246-272`).
8. Three-way AND legs (§3.2).
9. `buildShadowScore` (§3.6) + the `serverGate` audit object (§3.7).
10. If `autoApply`: `lockPeriodInTx(db, orgId, periodId)` (ADR-0028 per-(org,period) serialization), domain
    mutation, `updateToolCallLogOutput(auto_applied:true)` → applied; else held with
    `{status:"held", reviewId: toolCallLogId}` (`:363-397`).
11. Domain errors → `translateAccountingError` (`:400-402`).
12. Outcome → HTTP: replay→200/202, applied→201, held→202 (`:404-419`).
13. `finally { slot.release() }` frees the admission slot on every path (release is idempotent).

### 3.2 The three-way AND

`autoApply = confidenceOk && !veto.held && score.isGreen` (`:321`), three **independent** legs:

- **Leg 1 — client confidence (necessary, never sufficient):** `confidenceOk = opts.confidence >= 0.9 &&
!amountHold` (`:289-290`). `AUTO_APPLY_THRESHOLD = 0.9` (env `ACCOUNTING_AUTO_APPLY_THRESHOLD`).
  `amountHold` fires if any hold amount > `ALWAYS_HOLD_AMOUNT = 100000` CZK. The confidence scalar feeds **only**
  this leg; it never enters the score.
- **Leg 2 — independent server veto:** `deriveVeto(db)` (payload-derived checks, e.g. `deriveCaptureVeto`);
  never routed through the score engine.
- **Leg 3 — server score green:** `score = scoreEvidence(opts.signals, serverDerivedSignals)` (`:320`) — ignores
  the client confidence entirely, scores the fail-closed `signals` envelope server-side (§4).

Note the **two thresholds**: the confidence-leg is `0.9`; the score green threshold is `0.97` at cold start
(`COLD_START_GREEN_THRESHOLD`), `0.95` once a fit exists (but the live gate is pinned to cold start).

### 3.3 The cold-start extraction_failed floor

`buildScoreInputs` (`evidence-gate.ts:80-106`) unconditionally injects
`UNVERIFIED_EXTRACTION_SIGNAL = "extraction_failed"` — a Tier-3 defer signal → `capFromSignals` returns
`{blocked:true, cCaps:0}` → `computeCRaw` = 0 → `cFinal = 0`, `isGreen(0, coldStart=0>=0.97) = false`. So Leg 3 is
**always false at cold start → autoApply always false → 201 is structurally impossible → every write is 202
HELD.** No fitted calibration map can lift it. The **5 fields degraded fail-closed** (`evidence-gate.ts:95-105`):
`firedSignals` (block injected), `kbRule→"none"`, `verify→{}`, `extractionQuality→0`, `reconciliation→"none"`.
Only self-reported Tier-2 CAP kinds survive, and they can only lower trust.

### 3.4 Every HTTP status (source: `apps/api/src/v1/domain-exception.filter.ts:28-39`)

- **200** — replay of a previously _applied_ write (`Idempotent-Replayed: true`).
- **201** — fresh applied write. **Unreachable at cold start.**
- **202** — fresh held write, or replay of a held write. Body `{status:"held", reviewId}`.
- **400** — `ZodValidationPipe` DTO failure before the handler, or an unmapped DomainError code.
- **403** — `"Accounting writes require a user-bound API key (responsible person)"` (`gate.ts:176-178`);
  missing scope; or (on the held-write surface) the agent-actor deny.
- **409** — idempotency in-progress / different-body reuse (`gate.ts:262-269`).
- **422** — missing/oversized Idempotency-Key; missing `conversationId`; or domain-integrity translations
  (unbalanced posting, closed period, FX inconsistency, SQLSTATE 22/23514).
- **429** — three distinct sources, distinguishable by the message body: (a) the **write-lane admission**
  `"The accounting write runtime is disabled (BRAIN_RUNTIME_ACTIVE off)"` (kill-switch off) or `"Too many
concurrent accounting runs; retry shortly"` (concurrency cap); **and** (b) a **V1-wide per-API-key rate
  limit** that also fronts the write endpoints — `ApiKeyThrottlerGuard` (`apps/api/src/v1/api-key-throttler.guard.ts`),
  registered as an `APP_GUARD` with `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])`
  (`apps/api/src/v1/v1.module.ts:46,61`) → **100 requests / 60 s per key**, generic `rate_limited` body
  `"Too many requests. See the RateLimit-* headers…"` + IETF `RateLimit-*` headers. If a write 429s, read the
  message string first: the throttler one is NOT a Brain-gate problem.
- **404** — `NotFoundError` from `translateAccountingError` (e.g. RLS-hidden references).

### 3.5 BRAIN_RUNTIME_ACTIVE + admission caps

`isBrainRuntimeActive` (`packages/db/src/admission.ts:70-77`) reads `env.BRAIN_RUNTIME_ACTIVE`, trims+lowercases,
admits **only** the exact strings `"true"` or `"1"`; everything else is fail-closed `false`. It is the default
kill-switch of the process-wide `accountingAdmission` singleton (`apps/api/src/v1/accounting/admission.singleton.ts`).
`acquire()` checks the kill-switch first → `AdmissionRejected("kill_switch_inactive")` → the 429 above; when live,
it enforces a **global cap 32** (`ACCOUNTING_ADMISSION_GLOBAL_CAP`) and **per-org cap 8**
(`ACCOUNTING_ADMISSION_PER_ORG_CAP`). Held-write **resolve** is deliberately NOT admission-gated — a human must
always be able to drain the queue even when the write lane is killed.

> **`BRAIN_RUNTIME_ACTIVE` is a deploy-time flag, fail-closed OFF.** A deploy that omits `brain_runtime_active`
> resets it to `0` and every write 429s. See §7 and the "PRE-LAUNCH DEFAULT" note in `_deploy-aws.yml`.

### 3.6 The shadow score (audit-only telemetry, never decides)

`buildShadowScore(body, signals, serverDerivedSignals)` (`apps/api/src/v1/accounting/shadow-score.ts:197-271`) is
pure, side-effect-free, never-throwing. JSON shape (`ShadowScore`):

- `v` — `SHADOW_FORMULA_VERSION = 1`, the re-scoring anchor.
- `serverLane` — `{ inputs:{kbRule:"none", extractionQuality:0, verify:{vatBaseMatchesNet?, periodConsistent?},
reconciliation:"none", firedSignals}, cRaw }`. The future M3 x-axis: base fields stay floored, verify booleans
  are **recomputed server-side** from the payload via `deriveServerVerify` (never the client claim), and the
  `extraction_failed` block is **dropped on this lane** so `serverLane.cRaw` is a real non-zero number.
- `claimLane` — `{ cRaw }` only: scores the client's claims as-submitted. Diagnostic; explicitly "NEVER a
  training x".
- `claimAudit` — `{ vatBaseMatchesNet:{claimed,derived}, periodConsistent:{claimed,derived} }`: per-write
  client-honesty telemetry.

It carries no `isGreen`/`blocked`/verdict. It is **never read for a decision** — enforced by
`shadow-audit-only.boundary.test.ts` (an allowlist test proving zero `.shadow` reads in any `apps/api/src`
production file including the gate).

### 3.7 The serverGate object persisted to tool_call_log

Built at `gate.ts:339-361`, persisted into `tool_call_log.output_json` as
`{ payloadHash, serverGate, ...appliedBody|heldBody }`. `payloadHash` + `serverGate` are audit-only, stripped from
the replay body. Keys: `veto` (the leg-2 `{held, signals}`), `score`
(`{cRaw, cFinal, isGreen, blocked, firedSignals, reasons}` — the honest enforced verdict), `shadow` (§3.6),
`templateId`, `templateNovel` (found-but-unconfirmed), `ocrUnverified` (OCR capture with no confirmed template).

---

## 4. Confidence model

_(how a booking is scored — ADR-0026 "D6")_

### 4.1 Principle

The score is a pure function of **infrastructure signals**, never the model's self-reported certainty
(`packages/brain/src/gate/gate.ts:9-12`; `docs/adr/0026-brain-confidence-model.md:17-20`). `scoreProposal` never
even receives the client confidence scalar. The client `confidence` (`accounting-writes.ts:305-314`) does exactly
one thing: it is leg 1 of the auto-apply AND (§3.2) and is persisted to `tool_call_log.confidence` for audit. It
does **not** feed `cRaw`/`cFinal`.

### 4.2 The signals the server scores (`packages/brain/src/confidence/score.ts` + `signals.ts`)

- **kbRule tier** → base `C_kb` (`score.ts:9-22`): `constitution_safe`=0.95, `high_active`=0.90, `medium`=0.75,
  `low_mixed`=0.55, `none`=0.40.
- **extractionQuality** `[0,1]` → `+0.15 * clamp(q)` (`score.ts:99`).
- **reconciliation** (`score.ts:43-48`): `full`=+0.04, `partial`=0, `none`=−0.03.
- **verify bonuses** (additive, PASSED only — `score.ts:24-40`): `vatBaseMatchesNet`+0.05,
  `rcChecklistPassesOrNA`+0.04, `decree500Confirmed`+0.03, `periodConsistent`+0.03, `bankVsKsSsMatch`+0.03. A
  _failed_ VAT check is not a penalty here — the caller instead fires the Tier-1 block `balance_mismatch`.
- **cap / block signals** (`signals.ts`): Tier-1 hard-block kinds (`no_source_doc`, `closed_period`,
  `constitution_violation`, `balance_mismatch`, `duplicate_key_collision`) → C=0; Tier-3 defer kinds
  (`extraction_failed`, `period_unknown`, `budget_exceeded`, `hitl_timeout`, `novel_template`,
  `unverified_template`) → C=0; Tier-2 review caps (0.55–0.85) cap the score at the _lowest_ fired value; 5
  "hard classes" (`asset_vs_expense`=0.60, `accrual_period_boundary`=0.65, …) are clamped **after** calibration so
  even a fitted map can't lift a fired hard class above green (`hard-class.ts:32-38`, `gate.ts:25-56,134-136`).

### 4.3 Client claims are degraded fail-closed (v1)

The enforced score never consumes a client base/verify claim directly. `buildScoreInputs` degrades every
non-server-verifiable field to its worst value before scoring (`evidence-gate.ts:95-105`): `kbRule→none`,
`verify→{}`, `extractionQuality→0`, `reconciliation→none`, plus the injected `extraction_failed` block. Only
recognized Tier-2 cap kinds survive (they can only lower trust). Server-derived Tier-3 holds
(`novel_template`/`unverified_template`) are injected server-side, never by the client — and a client cannot forge
them because `buildScoreInputs` keeps only recognized cap kinds and drops any other kind (`:88-99`).

### 4.4 Composition, threshold, calibration

`computeCRaw` (`score.ts:90-107`): `composite = C_kb + C_verify + 0.15*extractionQuality + C_recon`;
`cRaw = blocked ? 0 : min(cCaps, composite)`. Green threshold: `0.95` fitted / `0.97` cold-start
(`calibration.ts:10-12,159-166`). `applyCalibration(cRaw, model)` (`calibration.ts:144-156`) returns identity
while unfitted; fitted, it is a monotone PAV step lookup with **left+right clamp** (a `cRaw` beyond the last block
keeps the last block's `y`). `cFinal = blocked ? 0 : min(applyCalibration(cRaw), minHardCap(firedSignals))`.

### 4.5 The two floors → green unreachable at cold start

1. **enforced-lane `extraction_failed` floor:** the injected block forces `cRaw = 0`, so the **enforced-lane cRaw
   ceiling is exactly `0`** — green is structurally unreachable regardless of any fit.
2. **`kbRule=none`=0.40 floor:** what bounds the score once the block is dropped. With `kbRule=none` (0.40),
   `extractionQuality=0`, `reconciliation=none` (−0.03), and only the two server-recomputable verify bonuses
   (`vatBaseMatchesNet`+0.05, `periodConsistent`+0.03), the un-blocked `cRaw` maxes at **~0.45** — far below the
   0.95/0.97 threshold. This band is exactly the shadow `serverLane` (§3.6). Green becomes reachable only once
   **server-side re-verification (milestone W3.3b)** un-floors `kbRule`/`extractionQuality`/`reconciliation`.

### 4.6 Calibration refit — built vs wired

`fitPav` (PAV isotonic, `calibration.ts:38-59`), `refitCalibration(logs)` (derives the distinct-run count
internally via `new Set(runId)`, returns identity below `MIN_CALIBRATION_RUNS=10`, else fits), the
`HumanReviewOutcome` label typing (no `correct:boolean` field, so a model belief can't be a label), `brierScore`
(target ≤0.04, ADR-0026), and the locked reference fixtures are **built + tested**. **NOT wired:** the fitted model
is never plugged into the live gate — `refitCalibration` has **zero non-test callers**, and the live gate is pinned
to `scoreProposalColdStart` (identity). Fit-on-real-runs + live wiring is deploy-gated M3, explicitly out of v1
scope. _(There is no train/test "holdout" split anywhere — only the distinct-runId ≥10 run-count guard.)_

---

## 5. Data model, migrations, tenant isolation

> **Migration-numbering caveat:** the doc-comments in `packages/db/src/schema/*.ts` and `policies/rls.ts` are
> **off by one** for every accounting migration `≥0025` (e.g. `accounting_event.ts` says "0027" but the table is
> created in `0028_accounting_capture.sql`; the org-isolation RLS the comments attribute to `0034` is really
> `0035`). The numbers below are the **verified on-disk filenames**.

### 5.1 Three tenancy tiers + GUCs (`packages/db/src/policies/rls.ts`)

| Tier             | GUC                   | RLS                                                        | Tables                                                                                                                         |
| ---------------- | --------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Global**       | none                  | unscoped                                                   | `app_user`, auth tables, reference/law tables (`regime`, `legal_form`, `currency`, …)                                          |
| **Workspace**    | `app.workspace_id`    | FORCE RLS, 4 command-specific policies                     | `counterparty` (0035), `ocr_extraction_template` (0047), `audit_event` (0005)                                                  |
| **Organization** | `app.organization_id` | ENABLE + FORCE RLS, single `organization_isolation` policy | `api_key`, `organization`, `tool_call_log`, the 23 v2-accounting org-scoped tables (0035 §1), + 3 org-config satellites (0042) |

Both tenant GUCs are read with `NULLIF(current_setting('app.<x>', true), '')::uuid`. `organization.organization_id`
is kept `== id` by trigger `app_organization_self_id` (0003) so every policy uses one uniform predicate.

### 5.2 Composite-FK tenant isolation (FK bypasses RLS)

A Postgres FK integrity check reads the **parent** row as an internal op **not subject to RLS**, so a naive
`counterparty_id → counterparty(id)` FK would let org A reference org B's row. Fix: the tenancy key rides _inside_
the FK — every parent carries `UNIQUE(id, organization_id)` (or `(id, workspace_id)`) and children reference the
composite. Examples: `accounting_event` party/counterparty FKs on `(…, workspace_id)`
(`accounting_event.ts:69-78`); `posting` FKs on `(…, organization_id)` incl. the regime-spine
`(period_id, organization_id, regime_code)` (`posting.ts:77-100`); `ocr_extraction_template` carries
`UNIQUE(id, workspace_id)` for the same reason.

### 5.3 Write-path row lifecycle + tool_call_log

`accounting_event` (the účetní případ) → `summary_record` (doklad header, numbered via `number_series`, a gapless
`FOR UPDATE` counter not a SEQUENCE) → `individual_record` (line linking event↔voucher) → `partial_record` (the
money level: `base_amount`, `vat_mode`, `vat_amount`, frozen `*_in_accounting_currency`). `posting` (účetní zápis)
then expands one partial into N MD/D lines (`posting_double_entry_line`/`posting_monetary_line`).

Every gated write records a `tool_call_log` row inside the same `withOrganization` tx (`write-log.ts`): insert with
`output_json = NULL`, then `updateToolCallLogOutput`. Applied → `{payloadHash, serverGate, status:"applied",
...ids}`, `auto_applied=true`; Held → `{payloadHash, serverGate, status:"held", reviewId:<toolCallLogId>}`,
`auto_applied=false`. Idempotency: `UNIQUE(organization_id, tool_name, idempotency_key)` (0004); replay returns
the prior row, 409 on body-hash mismatch.

### 5.4 api_key shape

`0015_api_key.sql` + `0045_api_key_actor_kind.sql`. Org- **and** workspace-bound (both NOT NULL, ON DELETE
CASCADE), FORCE RLS. `key_hash` = sha256 hex (UNIQUE); `prefix varchar(20)`; `scopes text[] DEFAULT '{}'`;
`created_by_user_id → app_user(id)` (the responsible person; writes require it). `actor_kind text NOT NULL DEFAULT
'human'` CHECK `('human','agent')`, added in **0045** (#517), deliberately text+CHECK not a pgEnum.
**Do not conflate** this with the `tool_call_log.actor_kind` **pgEnum** `('human','ai','ai_on_behalf','system')`
from 0004 — two different domains; the gate maps an agent key → `ai_on_behalf` for the audit row.

### 5.5 Append-only vs mutable (constitution I5)

`0035_accounting_enforcement.sql`. **Mutable (17)** incl. the document/capture layer (`summary_record`,
`individual_record`, `partial_record`, `accounting_event`) — these are mutable, not append-only. **Append-only
(6):** `posting, posting_double_entry_line, posting_monetary_line, signature, period_output,
open_item_settlement` — each with BEFORE UPDATE/DELETE/TRUNCATE block triggers. A posted record is **corrected,
never edited/deleted** — a new posting linked by `corrects_posting_id` + `correction_type
REVERSAL|SUPPLEMENTARY` (ČÚS 001 §35; constitution I4). `tool_call_log` is itself append-only (DELETE/TRUNCATE
blocked; only `output_json`/`auto_applied`/`approved_by_user_id`/`rationale` updatable) and is the rollback UNIT
— a "run" = all rows sharing `conversation_id`; there is **no** per-row `brain_run_id` column.

### 5.6 Accounting migration map (verified on-disk)

`0004` audit (`actor_kind` enum + `tool_call_log`) · `0015` `api_key` · `0025` accounting enums/reference ·
`0026` reference seed · `0027` `accounting_period` + org reshape · `0028` `number_series` + `accounting_event`

- `summary/individual/partial_record` · `0029` chart/account/category · `0030` `posting` (+ lines, self-FK) ·
  `0031` asset/depreciation/inventory · `0032` `open_item`(+settlement) · `0033` read-model · `0034` output read
  surface · `0035` FORCE RLS + `organization_isolation` on all 23 + append-only triggers · `0045` `api_key.actor_kind`
  · `0047` `ocr_extraction_template`.

---

## 6. Learning, OCR templates, and the constitution

### 6.1 OCR template lifecycle (this IS built)

Table `ocr_extraction_template` (0047, workspace-scoped, 4 RLS policies). Trust columns: `human_confirmed_at`
(NULL = unconfirmed), `held_count`, `last_reject_at`, `version`, `UNIQUE(id, workspace_id)`. Endpoints
(`apps/api/src/v1/ocr-templates/ocr-templates.controller.ts`): `GET` list (user-bound, no scope); `POST` create
(`accounting:write`, **agent-allowed** — server pins unconfirmed, `held_count:0`, `version:1`); `PUT :id` refine
(`accounting:write`, **agent-allowed** — RE-OPENS trust: `human_confirmed_at→null`, `version+1`; identity
immutable); `POST :id/confirm` (`accounting:write` + **`@RequireHumanActor` → agent 403**, sets
`human_confirmed_at=now()`). Reject un-confirms via `unconfirmTemplateOnReject`
(`packages/db/src/accounting/ocr-template-trust.ts:32-45`) — called from the held-write reject branch + the web
approvals action (one shared helper). Only a **confirmed** template lets an OCR capture auto-apply.

### 6.2 The write-gate template legs

`novel_template` (found-but-unconfirmed) vs `unverified_template` (no confirmed basis at all) — both Tier-3 defer
→ `cRaw=0` → HELD, disjoint flags from `screenTemplateBasis(db, extractionMethod, templateId)`
(`accounting-veto.ts:280-330`): `templateId==null` OR row-not-found-under-RLS → `ocrUnverified`; row found +
`human_confirmed_at IS NULL` → `templateNovel` (+`held_count+1`); confirmed → neither. `extractionMethod` drives
it: `isOcr = method == null || method === "ocr"` (`:287`) — **an omitted method fails closed to OCR**, so an agent
can't omit the discriminator to dodge the screen. The screen runs **only for a tamper-proof `agent` key**
(`principal.actorKind === "agent"`, not the conversationId-broadened value; `gate.ts:307-310`). A client cannot
forge either signal (they're server-injected; `buildScoreInputs` drops any non-cap client kind). **Residual gap
(documented):** the DECLARED `extractionMethod` value is not server-verifiable — mislabeling an OCR capture as
`structured` skips the leg undetectably; and structured `/v1/invoices` captures aren't screened. Both are M3/M4
floor-lift preconditions.

### 6.3 Workspace-scoping (ADR-0029)

Learned state is per-**workspace**, not per-org: a supplier's invoice layout is a supplier fact identical across
every client book in the office. Mechanically mirrors `counterparty` (`workspace_id` column, 4 RLS policies on
`app.workspace_id`, `UNIQUE(id, workspace_id)`). In the gate the screen reads the workspace-scoped row inside the
org tx because `withOrganization` also sets `app.workspace_id`.

### 6.4 The constitution I1–I10 + executable checks

`packages/brain/.brain/constitution.md` — LOCKED, human-authorship-only. I1 server-side `withOrganization`; I2
never `withAdminBypass` on agent writes; I3 no tenancy fields in tool inputs; I4 `tool_call_log` +
`conversation_id` is the rollback unit; I5 the API request-schema boundary is PRIMARY; I6 held-before-applied;
I7 human-final-review is the master gate; I8 confident-wrong is the cardinal sin; I9 read-side IR only, no write
templates; I10 provenance/průkaznost. **Only I2, I3, I5 have executable checks** —
`scripts/brain-build/constitution-checks/check.sh` greps (I2) `withAdminBypass`/`SET ROLE app_admin` forms across
`packages/brain/src`; (I3) tenancy ids in declaration position under `src/tools/`; (I5) Drizzle writes / raw
`UPDATE|DELETE` / `` sql`…` `` / `.execute(`/`.query(` under `src/tools/`. `check.sh` is the **sole automated
defense** for I2/I5 (the ESLint `require-with-organization` rule enforces I1 but _permits_ `withAdminBypass`).
I1/I4/I6/I7/I8/I9/I10 have **no** automated check — human review + advisor gate.

### 6.5 The `.brain/` store + the librarian — ENGINE BUILT, NOT YET CONNECTED TO REAL DATA

`packages/brain/.brain/` today: `constitution.md` (real, locked), `protocol.md`, `CHANGELOG.md` (one entry), and
six subdirs (`rules/`, `aliases/`, `memory/`, `judge/`, `evals/`, `agents/`) that each contain **only a
README.md** stating "Empty at M0, librarian-populated via GitHub PR" — still true, all six are empty. **The
librarian ENGINE (M2.2) is built at `packages/brain/src/librarian/`**: `ingestCorrections` (raw `tool_call_log`
rows → `CorrectionRecord`, reading the `resolution`/`edit` a human recorded via `resolveHeldWrite`) →
`clusterCorrections` (group by the 4-fact signature — counterparty/direction/supply_kind/jurisdiction, mirroring
the unmerged #643 `BookingSignature`) → `distillCandidate` (majority-vote a `CandidateRule`) → `evaluateCandidate`
(gate on the already-locked `booking_rule_pr_gate` bound, 0.90) → `buildProposalArtifact` +
`writeProposalArtifact` (emit a `status:"proposed"` JSON file to a caller-supplied directory — never a default
path, never `.brain/rules/` directly). Fixture-tested only (42 tests, `pipeline.test.ts` runs the whole chain
end-to-end). **Still NOT built:** a real `tool_call_log` → `RawCorrectionRow` adapter (needs real corrections,
M2.3), and the `workflow_dispatch` PR-automation ADR-0027 describes (artifact → GitHub PR is a human/automation
step outside this engine). So the OCR-template library is real+wired, and the librarian's core distillation
engine now exists and is unit-tested, but **the learning loop is not yet connected end-to-end on real data** — no
artifact has ever been produced from a real correction, and none of the six `.brain/` learned-content dirs has
gained a file. Do not describe Brain as "self-improving" in production today; it _proposes bookings and holds
them_, and the mechanism that WOULD make it self-improving is built but unconnected. The learn-on-confirm /
layout-drift re-detection is open item #518.

---

## 7. Debugging playbook

Symptom → most-likely cause → where to look. (The write-lane and conversationId rows are the two that bit us
first in practice.)

| Symptom                                                                                                  | Cause                                                                                                                                                                                                                 | Fix / where                                                                                       |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **CLI prints "Brain write lane is currently off (or the write was rate-limited) — nothing was booked."** | `BRAIN_RUNTIME_ACTIVE != "1"` on the running api task (or a concurrency/throttle cap). M0.2a: the client no longer pre-checks this — it always attempts, and this clean sentence replaces the raw `429 rate_limited`. | Re-deploy with `brain_runtime_active=1` (`_deploy-aws.yml`), or verify the ECS task-def env. §3.5 |
| **Write `400 "Validation failed"` (no field detail)**                                                    | Usually `conversationId` is not a UUID — the server requires it (`z.string().uuid()`); fixed GH #577, the generated MCP tool schema also enforces `.uuid()`.                                                          | Pass a UUID (`uuidgen`). §1.5, §2.2                                                               |
| **`422 "conversationId is required for a user-bound agent key"`**                                        | Agent key logs `ai_on_behalf`, which requires a conversationId.                                                                                                                                                       | Add a UUID `conversationId` to the capture. §2.2, §3.4                                            |
| **`403 "Accounting writes require a user-bound API key"`**                                               | The key has `created_by_user_id = null`.                                                                                                                                                                              | Re-issue via "Issue Brain agent key" (binds the user). §2.5                                       |
| **`403` on `/approvals` list/resolve**                                                                   | Working as designed — agent keys are `@RequireHumanActor` 403 there. A human must approve.                                                                                                                            | §2.2                                                                                              |
| **`brain book/run blocked: … Missing/unmet …`**                                                          | `BRAIN_API_KEY` is unset — the one required paste (M0.2a collapsed every other var to a default).                                                                                                                     | `source docs/runbooks/mlive.local.sh`. §1.2                                                       |
| **`brain extract/book` won't start — asks for an Anthropic token**                                       | Misreading: `BRAIN_AGENT_SDK_AUTH` must be _set_ but on-Mac the value `ambient` is sufficient (nested Claude uses the machine's login).                                                                               | Set `BRAIN_AGENT_SDK_AUTH=ambient`; never demand `sk-ant-…`. §1.2                                 |
| **Health `503 "Afframe is asleep"`**                                                                     | Prod is cold-paused.                                                                                                                                                                                                  | `gh workflow run power.yml -f environment=production -f action=resume` (~8 min RDS cold start).   |
| **A capture that "should" auto-apply is still HELD**                                                     | Expected at cold start — the `extraction_failed` floor forces `cRaw=0`; green is unreachable until M3. A cold-start `201` would be a **broken-gate alarm**.                                                           | §3.3, §4.5                                                                                        |
| **OCR capture unexpectedly HELD even with a template**                                                   | The template is unconfirmed (`novel_template`) or the basis is missing/foreign (`unverified_template`); or `extractionMethod` omitted → fails closed to OCR.                                                          | A human must `confirm` the template. §6.1, §6.2                                                   |
| **`429 "Too many concurrent accounting runs"`**                                                          | Admission cap hit (global 64 / per-org 16 pre-launch deploy; code fallback 32/8 if env unset).                                                                                                                        | Retry; or raise `ACCOUNTING_ADMISSION_*` env. §3.5                                                |
| **`429 "Too many requests…"` with `RateLimit-*` headers**                                                | NOT a Brain-gate issue — the V1-wide per-key throttler (`ApiKeyThrottlerGuard`, 300 req/60 s per API key pre-launch deploy; code fallback 100/60s) that fronts all `/v1/*` incl. writes.                              | Slow down / respect the `RateLimit-*` headers; the limit is per key (`v1.module.ts`). §3.4        |
| **Nested `query()` won't authenticate**                                                                  | `BRAIN_AGENT_SDK_AUTH` starts with `sk-` but the key is invalid, OR the machine has no Claude Code login for the `ambient` path.                                                                                      | Use a valid `sk-ant-…`, or log in Claude Code and use `ambient`. §1.2                             |
| **Bridge won't start / `ERR_MODULE_NOT_FOUND`**                                                          | Someone pointed it at `dist/server.js` (not node-runnable) instead of the tsx source.                                                                                                                                 | Run from inside the monorepo; the bridge uses `apps/mcp/src/server.ts` via tsx. §1.1              |

**Operator DB access for verification** (`docs/runbooks/DB-ACCESS.md`): `./scripts/db-query.sh production "SET
ROLE app_admin; SELECT jsonb_pretty(output_json->'serverGate') FROM tool_call_log WHERE conversation_id='<uuid>'"`
shows the exact gate verdict + shadow for a write.

---

## 8. Real vs aspirational

An accuracy ledger, so nobody re-derives a stale roadmap:

- **Live-confirmed (real):** the full loop end to end on prod — CLI → nested SDK → tsx bridge → REST → gate →
  202 HELD + recorded shadow (2026-07-07). The server three-way-AND gate, the cold-start floor, the shadow
  instrumentation, the admission kill-switch, the OCR-template library + its gate legs, the constitution checks
  for I2/I3/I5, tenant isolation + composite FKs.
- **Built but NOT wired into the live path:** the calibration refit (`refitCalibration`, PAV, Brier) — zero
  non-test callers; the live gate is pinned to the cold-start identity map. Green is unreachable until M3 wires a
  fitted map _and_ server-side re-verification un-floors the base signals (W3.3b). The **librarian's distillation
  engine** (`packages/brain/src/librarian/`, M2.2) — ingest → cluster → distill → eval-gate → emit — is built and
  unit-tested (fixtures only), but has zero real callers: no adapter reads real `tool_call_log` corrections into
  it, and nothing invokes `writeProposalArtifact` against a real directory. Data-gated on M2.3.
- **NOT built:** the `RawCorrectionRow` real-data adapter, and the `workflow_dispatch` PR-automation ADR-0027
  describes (artifact → GitHub PR). The `.brain/rules|aliases|memory|judge|evals` learned dirs are still
  README-only — the engine that would populate `rules/` exists now, but has produced zero real artifacts. Learn-
  on-confirm / layout-drift re-detection = open #518.
- **Known code/doc drift to fix:** the `canUseTool` layer is shadowed by `allowedTools` — GH #578; the create-org
  wizard doesn't always scaffold period/series — GH #579; `packages/brain/README.md` describes the superseded
  in-process design; the schema-comment migration numbers are +1 off for accounting `≥0025`; `brain book`'s help
  mentions a `--live` flag that isn't registered. _(GH #577 — the generated MCP tool schema dropping `.uuid()`
  on `conversationId` — is fixed: `apps/mcp/scripts/gen-tools.ts` now emits `.uuid()` for any `format: "uuid"`
  JSON-Schema field, and `pnpm gen:all` regenerated the tool files.)_
- **Milestones:** M1 (operator onramp + instrumentation) engineering-done + live-confirmed; M2 (the human-review
  marathon) is the next phase and is a **process**, not code; M3 (calibration fit + field-by-field lift) is
  data-triggered engineering; M4 (certification + auto-apply) is final. All Brain ADRs (0025–0029) are still
  `Proposed` status.

---

## 9. The two thresholds — do not confuse them

_(expands §3.2 — this is the single most common mix-up when reading a `serverGate` audit row)_

There are **two independent thresholds** in the write gate, on two different scales, checked by two different
legs of the three-way AND (§3.2). Neither substitutes for the other, and a write needs **both** (plus the veto
leg) to auto-apply:

| Threshold              | Value                                               | What it gates                                                                                                                | Who computes it                                                      | Where                                                                                                |
| ---------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Client confidence**  | `>= 0.9`                                            | Leg 1 (`confidenceOk`) — the agent's **self-reported** `confidence` field on the request body.                               | The calling agent (client-side, unverified).                         | `AUTO_APPLY_THRESHOLD` — `accounting-writes.gate.ts:289-290` (env `ACCOUNTING_AUTO_APPLY_THRESHOLD`) |
| **Server score green** | `>= 0.97` (cold start) / `0.95` (fitted, not wired) | Leg 3 (`score.isGreen`) — `cFinal` computed **server-side** from re-derived/degraded signals, never from the client's claim. | The server's own scoring engine (`scoreEvidence` / `scoreProposal`). | `COLD_START_GREEN_THRESHOLD` — `calibration.ts:10-12,159-166`                                        |

**Why they must not be conflated:**

- They live on the **same [0,1] scale** but measure **different things** — one is "how sure the agent says it
  is," the other is "how sure the server's own evidence-scoring says it is." A high client confidence has **zero
  effect** on the server score (§4.1: `scoreProposal` never even receives the client confidence scalar).
- At **cold start** the server-score leg is structurally unreachable (§3.3/§4.5: the `extraction_failed` floor
  forces `cRaw = 0` regardless of client confidence), so **every write is HELD even when client confidence is
  1.0**. Seeing a HELD write with `confidence: 0.98` on the body is expected, not a bug — check `serverGate.score`
  in `tool_call_log.output_json`, not the request's `confidence` field, to see why.
- The debugging playbook (§7) row "A capture that 'should' auto-apply is still HELD" is the direct symptom of
  mixing these up: the client confidence being high says nothing about the server score being green.

## 10. File map — where each Brain concern lives

_(quick orientation — follow the section link for the full trace of each row)_

| Concern                                                                      | Path                                                                                                            | Section        |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------- |
| CLI entry / subcommands (`brain run\|book\|extract`)                         | `apps/cli/src/brain/command.ts`                                                                                 | §1.1, §1.5     |
| SDK launcher (spawns the nested Agent-SDK session + resolves the MCP bridge) | `apps/cli/src/brain/sdk-launcher.ts`                                                                            | §1.1           |
| Pure session/query-options config (env, kickoff, capture-outcome parsing)    | `apps/cli/src/brain/session-config.ts`                                                                          | §1.1–1.3       |
| Extract-lane policy + config                                                 | `apps/cli/src/brain/extract-config.ts`                                                                          | §1.3           |
| Live-session creds gate (`runLiveBrainSession`)                              | `packages/intake/src/harness/brain-cc-harness.ts`                                                               | §1.1, §1.2     |
| Local stdio MCP bridge (server + client)                                     | `apps/mcp/src/server.ts`, `apps/mcp/src/client.ts`                                                              | §1.1           |
| MCP tool codegen (source schema → generated tool files)                      | `apps/mcp/scripts/gen-tools.ts` → `apps/mcp/src/tools/generated/`                                               | §1.5, §8       |
| Sandbox policy (allowlists, `canUseTool` gate)                               | `packages/brain/src/agent/sandbox.ts`                                                                           | §1.3, §1.4     |
| API-key auth + actor_kind                                                    | `apps/api/src/auth/api-key.guard.ts`, `packages/auth/src/api-key-verifier.ts`                                   | §2.1–2.2       |
| The write gate (`runGatedWrite`, three-way AND)                              | `apps/api/src/v1/accounting/accounting-writes.gate.ts`                                                          | §3             |
| Evidence envelope degrade-fail-closed                                        | `apps/api/src/v1/accounting/evidence-gate.ts`                                                                   | §3.3, §4.3     |
| Confidence scoring (`scoreProposal`, cap/block signals)                      | `packages/brain/src/confidence/score.ts`, `signals.ts`                                                          | §4             |
| Calibration (PAV fit, Brier — built, not wired)                              | `packages/brain/src/confidence/calibration.ts`                                                                  | §4.4, §4.6     |
| Shadow score (audit-only, never decides)                                     | `apps/api/src/v1/accounting/shadow-score.ts`                                                                    | §3.6           |
| OCR template trust lifecycle                                                 | `apps/api/src/v1/ocr-templates/ocr-templates.controller.ts`, `packages/db/src/accounting/ocr-template-trust.ts` | §6.1–6.2       |
| Admission / kill-switch / concurrency caps                                   | `packages/db/src/admission.ts`, `apps/api/src/v1/accounting/admission.singleton.ts`                             | §3.5           |
| Tenant isolation (RLS, GUCs, composite FKs)                                  | `packages/db/src/tenancy.ts`, `packages/db/src/policies/rls.ts`                                                 | §2.4, §5.1–5.2 |
| The constitution (I1–I10, locked, human-authorship-only)                     | `packages/brain/.brain/constitution.md`                                                                         | §6.4           |
| Executable constitution checks (I2/I3/I5)                                    | `scripts/brain-build/constitution-checks/check.sh`                                                              | §6.4           |

---

_This document is generated from the current code; when the code changes, re-verify the cited `file:line`
anchors. For the operator quickstart see
[`BRAIN-OPERATOR-SESSION.md`](../runbooks/BRAIN-OPERATOR-SESSION.md); for the
one-page overview see [`README.md`](README.md)._
