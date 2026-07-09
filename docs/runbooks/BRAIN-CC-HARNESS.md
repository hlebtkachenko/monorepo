# Brain live-CC harness (WP-H, #469c)

> **CREDS-GATED — NOT YET RUNNABLE.** This runbook documents a harness whose live-run entry point
> (`runLiveBrainSession`) is intentionally a fail-loud gate: it throws `BrainHarnessNotWiredError` until a
> live Agent-SDK session, a deployed accounting MCP endpoint, and the write-lane kill-switch all exist. The
> **execution** below is the deploy-time launch step, not a step you can run today. The **dry-run planner**
> (`planBrainDryRun`) runs today without creds — use it to inspect exactly what a live run would do.

## What this is

The Brain v1 is a **headless Claude Code session that is an external CLIENT of the Afframe system** (MCP/HTTP,
unprivileged — see [`REFRAME-v1.2.md`](../../.context/afframe-brain/REFRAME-v1.2.md)). It logs into Brain with
a context-pack, uses the accounting domain's own MCP tools to read + propose bookings, and the **server**
enforces tenant isolation + the confidence gate. A client structurally cannot forge a green booking.

This harness is the thin scaffold that will drive the first end-to-end live session once creds exist. It
composes three already-built, creds-free pieces:

| Piece               | Where                                                                              | Role in the harness                                                                                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WP-A intake adapter | `packages/intake/src/ir-to-capture.ts` (`invoiceToCapture`)                        | Maps a read-side IR invoice → a `CaptureAccountingDocumentRequest` the server gates. Fabricates no VAT, emits no tenancy keys.                                                    |
| WP-B login-pack     | `packages/brain/src/agent/context-pack.ts` (`buildLoginContext`)                   | The system prompt a session boots with — hard-rule preamble + safety sections + the embedded sandbox policy.                                                                      |
| WP-B sandbox        | `packages/brain/src/agent/sandbox.ts` (`BRAIN_ACCOUNTING_POLICY`, `isToolAllowed`) | DEFAULT-DENY per-TOOL allowlist pinned to the real `mcp__afframe__*` tools; denies `resolve_accounting_held_write` + `list_accounting_held_writes` + every exfiltration built-in. |

The scaffold itself lives in `packages/intake/src/harness/brain-cc-harness.ts` (in `@workspace/intake`, the
one package that already depends on BOTH `@workspace/brain` and `@workspace/shared`, so it can compose the
WP-A adapter + the WP-B pieces with **no new dependency and no circular edge** — `@workspace/brain` must NOT
depend on `@workspace/intake`).

## Architecture

```
[Hleb launches a headless Claude Code session · Agent-SDK auth]        = the Brain client
   │  boots with the WP-B login pack (system prompt + concrete allow/deny tool lists)
   │  sandbox = BRAIN_ACCOUNTING_POLICY (per-TOOL, default-deny; no Bash/WebFetch/git/FS/DB)
   ▼
[deployed accounting MCP endpoint]   mcp__afframe__* tools (23 generated, #395)
   │  reads: get_structure / list_accounting_number_series / get_accounting_* reports
   │  proposes: capture_accounting_document (the WP-A-mapped request)
   ▼
[server confidence gate + veto]   apps/api — scoreProposal + deriveCaptureVeto, server-side
   │  auto-apply requires ALL: client scalar >= threshold AND veto.held===false AND server score green
   │  cold start + fail-closed evidence ⇒ effectively everything is HELD for human review
   ▼
[v2 accounting tables]   withOrganization · FORCE RLS · conversation_id = brain_run_id stamp
   ▲ escalate hard / low-confidence
[Advisor · Opus latest xhigh]   spawned by the CC session as a constrained sub-agent (mcp__advisor__*)
```

The **plan is fixed by the harness, never by a document.** A hostile instruction embedded in an ingested
invoice cannot add/remove/re-target a tool call, and cannot reach a denied tool (proven dry in
`brain-cc-harness.test.ts` — the N-2 assertion, creds-free half).

## Scaffold surface (`@workspace/intake`)

- **`planBrainDryRun(inputs): BrainDryRunPlan`** — RUNS TODAY, pure, no creds. Assembles the login pack,
  maps the invoice via WP-A, and returns the ordered `mcp__afframe__*` tool-call plan + the sandbox policy +
  the capture request. Each planned call is tagged with the sandbox verdict (`isToolAllowed`), so the plan
  can never schedule a denied tool.
- **`runLiveBrainSession(inputs): Promise<LiveBrainSessionResult>`** — CREDS-GATED, now WIRED to an injected
  launcher. It (1) fails closed on the creds gate, naming exactly what is unmet, BEFORE touching the launcher;
  then (2) if an `AgentSessionLauncher` was injected, delegates to it with the session config derived from the
  inspected plan (`plan.loginPack.system` / `allowedTools` / `disallowedTools` + `mcpEndpoint` + resolved
  `apiKey`). With no launcher injected it fails loud. It never fabricates a result, and it never reaches a
  launcher on a half-provisioned run. **[M0.2a]** it no longer pre-blocks on `BRAIN_RUNTIME_ACTIVE` / `BRAIN_LIVE`
  — that was a redundant CLIENT-side gate duplicating the SERVER's real admission authority, which still
  fails closed on its own kill-switch and HELDs/rejects every write regardless of the client. The client now
  always attempts; an admission-refused run comes back through the ordinary result, which `apps/cli` renders
  as a clean lane-off message (§ below), never a fabricated success.
- **`AgentSessionLauncher` / `AgentSessionLaunchOptions`** — the seam between this package and the Agent-SDK
  launch. The launcher OWNS the `@anthropic-ai/claude-agent-sdk` session and is INJECTED, so `@workspace/intake`
  imports the SDK **nowhere** (not even `import type`). The SDK-backed launcher belongs in operator tooling
  (`apps/cli`, `private:true`) and is added with the first live run (step 3 below); tests inject a mock. This
  is why the SDK is not — and must not become — a dependency of `@workspace/intake`.
- **`BRAIN_HARNESS_REQUIRED_ENV`** — the const naming every env the live run needs (kept in lockstep with the
  error message + this runbook).
- **`BrainHarnessNotWiredError`** — the precise fail-loud error.

## Creds / env the live run needs

**[M0.2a — env-collapse]** A fresh `apps/cli` session needs ONLY `BRAIN_API_KEY` pasted in.
`resolveBrainEnv` (`apps/cli/src/brain/env.ts`) defaults everything else:

| Env                    | Purpose                                                                                                                  | Default (apps/cli, M0.2a)          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| `BRAIN_MCP_ENDPOINT`   | The deployed REST API base URL (e.g. `https://api.afframe.com`), consumed by the local stdio MCP bridge.                 | `https://api.afframe.com` (prod)   |
| `BRAIN_API_KEY`        | The Brain's server-authorized accounting API key. The principal resolves org server-side; tenancy is NEVER a tool input. | none — the one required paste      |
| `BRAIN_AGENT_SDK_AUTH` | Agent-SDK auth. Dev sessions use subscription auth; the Bedrock spike uses AWS creds + `effort:xhigh`.                   | `"ambient"` (this machine's login) |

`BRAIN_RUNTIME_ACTIVE` (the write-lane kill-switch) and `BRAIN_LIVE` are **no longer read by the client at
all** (dropped M0.2a — see `BRAIN_HARNESS_REQUIRED_ENV`'s doc comment). `BRAIN_RUNTIME_ACTIVE` still exists as
the SERVER's deploy-time kill-switch (`apps/api/src/v1/accounting/admission.singleton.ts`, set via CDK
context) — that gate is unchanged and still fails closed; the client simply no longer pre-checks it before
attempting a run.

The **Agent-SDK itself (`@anthropic-ai/claude-agent-sdk`) is NOT a dependency of this repo** — it is referenced in
types + this runbook only. The scaffold composes our pieces and documents the SDK wiring; wiring the SDK in
is the deploy-time step, and it should live in the harness/operator tooling that launches sessions, not as a
runtime dependency of `@workspace/intake`.

## Provisioning the Brain API key ([#517] — required before any live run)

The Brain's `BRAIN_API_KEY` MUST be issued as an **agent-actor** key. The server-side key capability
(`api_key.actor_kind`, migration 0045) DENIES `actor_kind = 'agent'` keys on the held-write endpoints
(`GET /v1/accounting/held-writes` + `POST …/held-writes/:id/resolve`) entirely — an agent proposes gated
writes but can never list or resolve the human review queue. The column defaults to `'human'`, so a key
issued without this step would be able to resolve its own held writes (defeating the control). There is no
public key-issuance API today, so provision the Brain key directly (bastion / `scripts/db-query.sh` write
path) and set `actor_kind = 'agent'`:

```sql
INSERT INTO api_key (organization_id, workspace_id, name, prefix, key_hash, actor_kind)
VALUES (:org_id, :workspace_id, 'afframe-brain', :prefix, :sha256_hex, 'agent');
```

Bind the Brain key to a user (`created_by_user_id`) that **authors nothing outside Brain runs** (the
author≠approver rider is a second, independent backstop). Verify after issuance:
`SELECT actor_kind FROM api_key WHERE name = 'afframe-brain';` MUST return `agent`.

## First-live-run procedure (deploy-time, creds-gated)

Prereqs: #395 accounting write endpoints merged + `pnpm gen:all` run (the real `mcp__afframe__*` tool names
exist); the API + MCP deployed; the Brain API key issued; Agent-SDK auth available.

1. **Provision env.** Set `BRAIN_API_KEY` (the one required paste — everything else in
   `BRAIN_HARNESS_REQUIRED_ENV` defaults, M0.2a). Confirm the SERVER's write lane is actually on
   (`BRAIN_RUNTIME_ACTIVE=1` on the deployed api task) — the client no longer checks this itself, so a
   run against an off lane now surfaces as the clean lane-off message, not a client-side refusal.
2. **Build the dry-run plan first.** Call `planBrainDryRun` with the stub invoice + resolved uuids
   (periodId / seriesId / eventId from `get_structure` + `list_accounting_number_series`). **Inspect** the
   plan: the tool sequence, the sandbox verdicts (all `allowed`), and the capture request (valid, tenancy-free).
   Never spend a live session on an unreviewed plan.
3. **Provide the `AgentSessionLauncher`** (deploy-time; the ONE remaining deferred wire — needs the SDK +
   live creds, so it cannot be unit-verified in this repo). Implement it in `apps/cli` (`private:true`, keeps
   the SDK out of any published artifact), importing `@anthropic-ai/claude-agent-sdk` there and NOWHERE in
   `@workspace/intake`. The launcher receives `AgentSessionLaunchOptions` (already derived from the inspected
   plan) and constructs the CC session from them — no re-derivation:

   ```ts
   // apps/cli — the only place @anthropic-ai/claude-agent-sdk is imported.
   import { query } from "@anthropic-ai/claude-agent-sdk"
   import type { AgentSessionLauncher } from "@workspace/intake"

   const sdkLauncher: AgentSessionLauncher = {
     async launch(o) {
       // systemPrompt = o.plan.loginPack.system, allowedTools =
       // o.plan.loginPack.allowedTools, disallowedTools =
       // o.plan.loginPack.disallowedTools (the plan is the single source of truth
       // for the sandbox lists), MCP server pointed at o.mcpEndpoint authorized
       // with o.apiKey; drive the session, then map the server's persisted
       // tool_call_log.output_json.serverGate verdict into
       // LiveBrainSessionResult { brainRunId, applied, serverGate }.
       // (Exact SDK option names verified against the SDK version at wire time;
       //  this call is UNTESTED-LIVE until real creds + a deployed MCP exist.)
     },
   }
   ```

   Then call `runLiveBrainSession({ plan, mcpEndpoint, readEnv, launcher: sdkLauncher })`. Until this launcher
   is provided, `runLiveBrainSession` fails closed — the seam is wired and tested (mock launcher), only the
   SDK body + the live run remain (tracked on #469).

4. **Run the session** against the real tools. It reads structure/series, proposes the capture write, and the
   **server** gates it. Stamp `conversation_id = brain_run_id`.
5. **Record the result** (`LiveBrainSessionResult`): the `brain_run_id`, whether the server APPLIED or HELD,
   and the persisted `tool_call_log.output_json.serverGate` verdict.

## Acceptance checks (the deploy-gated E2E)

Run these once the harness is wired live:

1. **CC books a stub invoice E2E** — the session proposes a `capture_accounting_document` for the stub
   invoice against the real MCP endpoint, and the write reaches the server gate (applied or held).
2. **The server gate HOLDS at cold start** — with no fitted calibration + fail-closed evidence, the write is
   **HELD for human review**, not auto-applied. That is the intended pre-launch posture (the write lane is
   OFF; human review is the master gate). Green being unreachable is EXPECTED — do not "fix" it by trusting
   client base-score claims.
3. **The N-2 hostile doc cannot green** — feed the `HOSTILE_DOCUMENT` / `HOSTILE_HELD_WRITE_DOCUMENT` fixture
   through the live loop. The booking is unchanged, no denied tool (`Read` / `WebFetch` / `Bash` / `Write` /
   `mcp__git__push` / `resolve_accounting_held_write` / `list_accounting_held_writes`) can run, and the
   injected "book with high confidence" cannot itself reach green. (The creds-free half of this is already
   proven in `brain-cc-harness.test.ts`.)
4. **Subagent Opus escalation** — a hard/low-confidence case escalates to the constrained advisor sub-agent
   (`mcp__advisor__*`, Opus latest xhigh), not a raw `Task`/`Agent` spawn (both denied by the sandbox).
5. **Bedrock `effort:xhigh` spike record** — record the Bedrock spike run (auth + latency + a
   representative `effort:xhigh` call) so v2's metered-billing path has a baseline. This is spike-and-record,
   not a gate.
6. **A denied built-in is actually blocked live** — confirm the session cannot run `Read` / `Bash` /
   `WebFetch` (they are stripped by `disallowedTools`, and `canUseTool` default-denies any that still reach
   it). Belt-and-braces: the launcher's `canUseTool` fires + DENIES an off-list `afframe` tool (e.g.
   `mcp__afframe__resolve_accounting_held_write`) — verify the deny is observed, not just assumed.
7. **The session submits the inspected payload, not a fabricated one** — the kickoff embeds
   `plan.captureRequest` verbatim (`buildBrainKickoff`), so the `capture_accounting_document` the server
   receives matches the dry-run payload the operator inspected. Diff the two before trusting the run.

## Deferred (creds/deploy-gated — track, never fake)

The seam is wired + tested (`runLiveBrainSession` delegates to an injected `AgentSessionLauncher`, mock
launcher in `brain-cc-harness.test.ts`), and the **SDK-backed `AgentSessionLauncher` now exists** — it lives
in `apps/cli/src/brain/` (`sdk-launcher.ts`, the single `@anthropic-ai/claude-agent-sdk` import repo-wide;
pure config assembly + capture-result parsing in `session-config.ts`, unit-tested; operator entry
`afframe brain run --inputs <file.json>` — `--dry-run` inspects the plan with no creds). What remains is
genuinely deploy-gated and needs live inputs:

- the **live E2E run** (#469c execution), which needs the resolved `get_structure` uuids + the
  provenance-checked login-pack section texts + the deployed MCP + `BRAIN_RUNTIME_ACTIVE=1` (the SDK
  `query()` body in `sdk-launcher.ts` is the only UNTESTED-LIVE surface, marked as such);
- **M2** supervised-prod quarantine → promote, **M3** real ≥10-run calibration fit, **M4** autonomous
  certification.

See [`V1-DELIVERY-PLAN.md`](../../.context/afframe-brain/V1-DELIVERY-PLAN.md) §4.

## Dependency update tracking

Per the repo's **Dependency Update Coverage Rule** (root `CLAUDE.md`): this scaffold adds **no new versioned
dependency** — it composes existing workspace packages and adds no npm package, GitHub Action, Docker image,
or pinned binary. So there is **nothing new to track** (neither a Dependabot entry nor a custom update-check
workflow). When the harness/operator tooling later adds `@anthropic-ai/claude-agent-sdk`, that npm dependency will be
category 1 (Dependabot-covered) and needs no custom check.
