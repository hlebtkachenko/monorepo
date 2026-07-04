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
- **`runLiveBrainSession(inputs): Promise<LiveBrainSessionResult>`** — CREDS-GATED. Reads the required env via
  an injected `readEnv`, then throws `BrainHarnessNotWiredError` naming the exact missing env + pointing here.
  It fails loud **even with all env present**, because the Agent-SDK launch + MCP connection are the
  deploy-time wiring step (below). It never fabricates a result.
- **`BRAIN_HARNESS_REQUIRED_ENV`** — the const naming every env the live run needs (kept in lockstep with the
  error message + this runbook).
- **`BrainHarnessNotWiredError`** — the precise fail-loud error.

## Creds / env the live run needs

| Env                    | Purpose                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `BRAIN_RUNTIME_ACTIVE` | The write-lane kill-switch. MUST be `1` (defaults OFF, fail-closed). A set-but-not-`1` value is still closed.            |
| `BRAIN_LIVE`           | Explicit opt-in that live creds are present + the operator intends a real session.                                       |
| `BRAIN_MCP_ENDPOINT`   | The deployed accounting MCP endpoint URL (e.g. `https://api.afframe.com/mcp`).                                           |
| `BRAIN_API_KEY`        | The Brain's server-authorized accounting API key. The principal resolves org server-side; tenancy is NEVER a tool input. |
| `BRAIN_AGENT_SDK_AUTH` | Agent-SDK auth. Dev sessions use subscription auth; the Bedrock spike uses AWS creds + `effort:xhigh`.                   |

The **Agent-SDK itself (`@anthropic-ai/agent-sdk`) is NOT a dependency of this repo** — it is referenced in
types + this runbook only. The scaffold composes our pieces and documents the SDK wiring; wiring the SDK in
is the deploy-time step, and it should live in the harness/operator tooling that launches sessions, not as a
runtime dependency of `@workspace/intake`.

## First-live-run procedure (deploy-time, creds-gated)

Prereqs: #395 accounting write endpoints merged + `pnpm gen:all` run (the real `mcp__afframe__*` tool names
exist); the API + MCP deployed; the Brain API key issued; Agent-SDK auth available.

1. **Provision env.** Set every `BRAIN_HARNESS_REQUIRED_ENV` value. Confirm `BRAIN_RUNTIME_ACTIVE=1` — the
   write lane ships OFF, so this is the deliberate turn-on step.
2. **Build the dry-run plan first.** Call `planBrainDryRun` with the stub invoice + resolved uuids
   (periodId / seriesId / eventId from `get_structure` + `list_accounting_number_series`). **Inspect** the
   plan: the tool sequence, the sandbox verdicts (all `allowed`), and the capture request (valid, tenancy-free).
   Never spend a live session on an unreviewed plan.
3. **Wire the Agent-SDK launch** (deploy-time, not in this scaffold): construct the CC session with
   `allowedTools = plan.loginPack.allowedTools`, `disallowedTools = plan.loginPack.disallowedTools`,
   `systemPrompt = plan.loginPack.system`, and the MCP server pointed at `BRAIN_MCP_ENDPOINT`. This is where
   `@anthropic-ai/agent-sdk` is imported — outside this repo's runtime deps.
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

## Deferred (creds/deploy-gated — track, never fake)

The live E2E run itself (#469c execution), M2 supervised prod quarantine → promote, M3 real ≥10-run
calibration fit, and M4 autonomous certification are all deploy-gated launch steps. See
[`V1-DELIVERY-PLAN.md`](../../.context/afframe-brain/V1-DELIVERY-PLAN.md) §4.

## Dependency update tracking

Per the repo's **Dependency Update Coverage Rule** (root `CLAUDE.md`): this scaffold adds **no new versioned
dependency** — it composes existing workspace packages and adds no npm package, GitHub Action, Docker image,
or pinned binary. So there is **nothing new to track** (neither a Dependabot entry nor a custom update-check
workflow). When the harness/operator tooling later adds `@anthropic-ai/agent-sdk`, that npm dependency will be
category 1 (Dependabot-covered) and needs no custom check.
