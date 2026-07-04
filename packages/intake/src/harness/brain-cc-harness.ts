// WP-H (#469c) — the live headless-Claude-Code harness scaffold.
//
// This is the THIN, HONEST scaffold for the harness that will run the first end-to-end Brain session once
// live Agent-SDK + AWS + deployed-MCP creds exist. It composes the ALREADY-BUILT, creds-free pieces
// (WP-A intake adapter + WP-B login-pack + sandbox) into one documented entry point. The two halves are
// deliberately separated:
//
//   - `planBrainDryRun` — RUNS TODAY, no creds. Given a stub IR invoice + a harness context, it builds the
//     login context-pack (WP-B `buildLoginContext`), maps the invoice via the WP-A adapter
//     (`invoiceToCapture`), and returns the EXACT tool-call plan + the sandbox policy the live session would
//     use. This is the creds-free half of the E2E: a caller can inspect precisely what a live run would do.
//
//   - `runLiveBrainSession` — CREDS-GATED. It launches a real Claude Code session (Agent-SDK), connects to
//     the deployed accounting MCP endpoint, and drives the session against the real tools + the server gate.
//     It is NOT wired here and does NOT fake runnability: it THROWS a precise "requires <exact creds/env>"
//     error until the harness is wired at deploy time. See `docs/runbooks/BRAIN-CC-HARNESS.md`.
//
// HARD RULE (no fake runnability): every function that would need live creds/MCP throws a clear
// requirements error. There is no stub that pretends to work. The Agent-SDK is referenced in TYPES and the
// runbook only — it is NOT a dependency of this package (composing our pieces + documenting the SDK wiring,
// not pulling it in).
//
// PURITY of the dry-run half: no I/O, no clock, no randomness, no env reads. Identical inputs → identical
// plan. The live half reads env (the gate check) but performs no work before failing closed.

import type { CaptureAccountingDocumentRequest } from "@workspace/shared/api"
import type { Invoice } from "@workspace/brain"
import {
  buildLoginContext,
  BRAIN_ACCOUNTING_POLICY,
  isToolAllowed,
  type LoginContextPack,
  type LoginContextSections,
  type ToolAllowlistPolicy,
} from "@workspace/brain"
import { invoiceToCapture, type IrToCaptureContext } from "../ir-to-capture"

/**
 * The env flag names the live harness requires. These are DOCUMENTED, not read speculatively: the dry-run
 * planner never touches env; the live entry reads only these when it fails closed. Kept as a const so the
 * runbook, the error message, and the code stay in lockstep.
 */
export const BRAIN_HARNESS_REQUIRED_ENV = {
  /** The write-lane kill-switch. MUST be `"1"` before any live run (fail-closed default OFF). */
  runtimeActive: "BRAIN_RUNTIME_ACTIVE",
  /** Explicit opt-in that live creds are present + the operator intends a real session. */
  liveEnabled: "BRAIN_LIVE",
  /** The deployed accounting MCP endpoint URL (e.g. https://api.afframe.com/mcp). */
  mcpEndpoint: "BRAIN_MCP_ENDPOINT",
  /** The Brain's server-authorized accounting API key (principal → org, server-injected tenancy). */
  apiKey: "BRAIN_API_KEY",
  /** Agent-SDK auth. Bedrock spike uses AWS creds + `effort:xhigh`; subscription auth for dev sessions. */
  agentSdkAuth: "BRAIN_AGENT_SDK_AUTH",
} as const

/**
 * One planned MCP tool call in the dry-run. `toolName` is the real `mcp__afframe__<verb_resource>` name so
 * the sandbox gate (`isToolAllowed`) can be asserted against it verbatim. `input` is the exact request
 * payload the live session would send — for the capture write it is the WP-A adapter's output, tenancy-free
 * (org / user / workspace / role are server-injected from the API-key principal, never in a tool input).
 */
export interface PlannedToolCall<Input = unknown> {
  /** Real Claude Code MCP tool name (`mcp__afframe__<tool>`). */
  toolName: string
  /** Human-readable purpose, for the run log + the dry-run inspector. */
  purpose: string
  /** Whether the pinned sandbox policy allows this tool (echoed from `isToolAllowed`, not re-derived). */
  allowed: boolean
  /** The exact request payload the live call would carry. */
  input: Input
}

/**
 * The result of a dry-run plan: the login pack the live session would boot with, the sandbox policy in
 * force, and the ordered tool-call plan. Everything here is computed WITHOUT creds — it is the inspectable
 * contract of what a live run would do, so an operator (and a test) can verify the plan before spending a
 * live session on it.
 */
export interface BrainDryRunPlan {
  /** The WP-B login-to-Brain context-pack (system prompt + concrete allow/deny tool lists). */
  loginPack: LoginContextPack
  /** The sandbox policy the session runs under (echoed from the login pack for direct assertion). */
  policy: ToolAllowlistPolicy
  /** The ordered MCP tool-call plan the live session would execute. */
  toolPlan: PlannedToolCall[]
  /**
   * The capture write request the plan proposes to the server gate. Held separately (as well as inside
   * `toolPlan`) so a test can assert it carries no tenancy keys and is a valid capture partial mapping.
   */
  captureRequest: CaptureAccountingDocumentRequest
}

/**
 * The inputs a dry-run needs. `sections` are the WP-B login-pack section texts (the caller supplies the
 * provenance-checked texts; the pack assembler composes them). `captureContext` are the harness-supplied
 * uuids + the server-gate envelope the WP-A adapter needs (periodId / seriesId / eventId / confidence /
 * rationale) — NOT tenant data. `policy` defaults to the pinned per-TOOL accounting allowlist.
 */
export interface BrainDryRunInputs {
  /** A stub (or real) IR invoice to map through the WP-A adapter. */
  invoice: Invoice
  /** The login-pack section texts (constitution / KB pointer / law / confidence / escalation). */
  sections: LoginContextSections
  /** The harness-supplied capture context (uuids + confidence + rationale). */
  captureContext: IrToCaptureContext
  /** The sandbox policy to plan under. Defaults to `BRAIN_ACCOUNTING_POLICY` (pinned per-TOOL). */
  policy?: ToolAllowlistPolicy
}

/**
 * Build the creds-free dry-run plan for a single-invoice Brain session.
 *
 * PURE. It (1) assembles the login pack via WP-B `buildLoginContext` (which embeds the sandbox policy and
 * fails closed on a self-contradictory policy), (2) maps the invoice to a capture request via the WP-A
 * adapter (which fabricates no VAT and emits no tenancy keys), and (3) returns the ordered tool-call plan
 * the live session would execute, each call tagged with whether the sandbox allows it. NO live session is
 * launched and NO MCP endpoint is contacted — this is the plan, not the run.
 *
 * The plan a live run derives from this is DECIDED by the sandbox + the server gate, never by a document:
 * the tool set is fixed here (read structure/series → propose the capture write), and the write is HELD or
 * applied by the SERVER gate over infra signals, never by the model's verbalized confidence.
 */
export function planBrainDryRun(inputs: BrainDryRunInputs): BrainDryRunPlan {
  const policy = inputs.policy ?? BRAIN_ACCOUNTING_POLICY

  // WP-B: assemble the login pack under this policy. `buildLoginContext` throws if the policy allows a
  // denied built-in (fail-closed), so a broken sandbox can never reach the plan.
  const loginPack = buildLoginContext({
    ...inputs.sections,
    toolPolicy: policy,
  })

  // WP-A: map the IR invoice to the capture write request the server gates. Tenancy-free by construction.
  const captureRequest = invoiceToCapture(inputs.invoice, inputs.captureContext)

  // The fixed tool-call plan for a single-invoice session. The reads locate the tenant-side rows the write
  // references (the harness supplies the resolved uuids in `captureContext`); the write is the only mutation
  // and it is subject to the SERVER gate. Every tool name is the real `mcp__afframe__<tool>` name so the
  // sandbox decision is asserted verbatim, not approximated.
  const toolPlan: PlannedToolCall[] = [
    tool(
      "mcp__afframe__get_structure",
      "Resolve the accounting structure (period + number-series ids) the write references.",
      policy,
      { as: "read" },
    ),
    tool(
      "mcp__afframe__list_accounting_number_series",
      "Look up the DOCUMENT number-series the capture write hangs off.",
      policy,
      { as: "read" },
    ),
    tool(
      "mcp__afframe__capture_accounting_document",
      "Propose the capture write. The SERVER gate scores + holds/applies it; the client cannot force green.",
      policy,
      captureRequest,
    ),
  ]

  return { loginPack, policy, toolPlan, captureRequest }
}

/** Build one `PlannedToolCall`, tagging it with the sandbox verdict for `toolName`. */
function tool<Input>(
  toolName: string,
  purpose: string,
  policy: ToolAllowlistPolicy,
  input: Input,
): PlannedToolCall<Input> {
  return {
    toolName,
    purpose,
    allowed: isToolAllowed(toolName, policy),
    input,
  }
}

/**
 * The concrete session config a launcher receives, derived ENTIRELY from the inspected dry-run plan + the
 * resolved creds — never from untrusted document content. The launcher constructs a Claude Code session from
 * exactly these fields: the WP-B login pack's system prompt + concrete allow/deny tool lists, the deployed
 * MCP endpoint, and the Brain's API key. `plan` is carried so the launcher can drive/verify the fixed tool
 * sequence. This shape is Agent-SDK-agnostic on purpose: it names WHAT a session needs, not the SDK API.
 */
export interface AgentSessionLaunchOptions {
  /** WP-B login-pack system prompt (`plan.loginPack.system`). */
  systemPrompt: string
  /** Concrete allow-list of `mcp__afframe__*` tools (`plan.loginPack.allowedTools`). */
  allowedTools: readonly string[]
  /** Concrete deny-list of exfiltration/held-write built-ins (`plan.loginPack.disallowedTools`). */
  disallowedTools: readonly string[]
  /** The deployed accounting MCP endpoint URL. */
  mcpEndpoint: string
  /** The Brain's server-authorized accounting API key (resolves org server-side; never a tool input). */
  apiKey: string
  /** Agent-SDK auth token (subscription for dev; AWS creds for the Bedrock spike). */
  agentSdkAuth: string
  /** The inspected dry-run plan the session executes against the real tools. */
  plan: BrainDryRunPlan
}

/**
 * The seam between the creds-gated harness gate (this package) and the Agent-SDK launch (operator tooling).
 * A launcher OWNS the `@anthropic-ai/claude-agent-sdk` session — it is injected so `@workspace/intake` NEVER
 * imports the SDK (not even `import type`), keeping the SDK out of this package's dependency graph. The
 * SDK-backed launcher lives in `apps/cli`; tests inject a mock. `runLiveBrainSession` only reaches a launcher
 * AFTER the env + kill-switch gate passes, so a launcher can never run a write lane the server has OFF.
 */
export interface AgentSessionLauncher {
  launch(options: AgentSessionLaunchOptions): Promise<LiveBrainSessionResult>
}

/**
 * The inputs the live run needs. Typed so the shape is REAL (not vague): an operator wiring the harness at
 * deploy time fills exactly these. The dry-run plan is carried in so the live run executes a plan an operator
 * already inspected — it never re-plans from untrusted document content.
 */
export interface LiveBrainSessionInputs {
  /** The dry-run plan (from `planBrainDryRun`) the live session executes against the real tools. */
  plan: BrainDryRunPlan
  /** The deployed accounting MCP endpoint URL. */
  mcpEndpoint: string
  /**
   * A resolver for the required env/creds. Injected (not read from `process.env` directly) so the gate is
   * testable and the module stays pure-by-default. Returns the value or `undefined` when unset.
   */
  readEnv: (name: string) => string | undefined
  /**
   * The Agent-SDK session launcher (operator-tooling-supplied). OPTIONAL: when absent the run fails closed
   * with `BrainHarnessNotWiredError`. There is deliberately NO default launcher in this package — the
   * SDK-backed one lives in `apps/cli`, so `@workspace/intake` carries no SDK dependency.
   */
  launcher?: AgentSessionLauncher
}

/**
 * The result a live run would return. Typed now so downstream (the run log, the acceptance checks) can bind
 * to a real shape; the live body that produces it is deploy-gated.
 */
export interface LiveBrainSessionResult {
  /** The `conversation_id` = `brain_run_id` stamp the run wrote (audit correlation). */
  brainRunId: string
  /** Whether the server gate APPLIED the capture write (true) or HELD it for human review (false). */
  applied: boolean
  /** The server gate's persisted verdict (`tool_call_log.output_json.serverGate`), echoed for the run log. */
  serverGate: unknown
}

/**
 * The precise, fail-loud requirements error `runLiveBrainSession` throws until the harness is wired. Its
 * message names the EXACT env/creds + points at the runbook — never a vague "not implemented".
 */
export class BrainHarnessNotWiredError extends Error {
  constructor(missing: readonly string[]) {
    super(
      "runLiveBrainSession cannot run: its creds/kill-switch gate is unmet or no Agent-SDK session launcher " +
        "was injected (the @anthropic-ai/claude-agent-sdk-backed launcher lives in apps/cli — NOT a dependency of " +
        `@workspace/intake). Missing/unmet: ${missing.join(", ")}. ` +
        "See docs/runbooks/BRAIN-CC-HARNESS.md for the wiring + first-live-run procedure.",
    )
    this.name = "BrainHarnessNotWiredError"
  }
}

/**
 * CREDS-GATED live-run entry point. It NEVER fakes a session and NEVER runs a write lane the server holds OFF:
 *
 *   1. It fails closed on the env/creds gate + the `BRAIN_RUNTIME_ACTIVE=1` write-lane kill-switch FIRST,
 *      before touching the launcher, naming exactly what is missing.
 *   2. Only then, if an `AgentSessionLauncher` was injected, does it delegate — handing the launcher the
 *      session config derived from the inspected dry-run plan. If no launcher was injected it fails closed
 *      (the SDK-backed launcher lives in `apps/cli`, so this package pulls in no SDK dependency).
 *
 * This is real wiring, not a stub: with a launcher + full env it launches the session and returns its
 * result; with anything unmet it fails loud. The SERVER gate still holds every write at cold start — the
 * launcher can only PROPOSE, never force a green (the auto-apply lane's three-way AND is server-side).
 */
export async function runLiveBrainSession(
  inputs: LiveBrainSessionInputs,
): Promise<LiveBrainSessionResult> {
  const missing: string[] = []

  // Fail-closed env gate. Every name is required for a real session; a missing one is named explicitly.
  for (const [, envName] of Object.entries(BRAIN_HARNESS_REQUIRED_ENV)) {
    if (!inputs.readEnv(envName)) missing.push(`env ${envName}`)
  }
  // The write-lane kill-switch must be explicitly ON — a set-but-not-"1" value is still closed.
  if (inputs.readEnv(BRAIN_HARNESS_REQUIRED_ENV.runtimeActive) !== "1") {
    missing.push(
      `${BRAIN_HARNESS_REQUIRED_ENV.runtimeActive}=1 (write lane OFF)`,
    )
  }
  if (!inputs.mcpEndpoint)
    missing.push("deployed MCP endpoint (inputs.mcpEndpoint)")

  // Fail closed on env/kill-switch BEFORE the launcher is ever consulted — a launcher must never see a
  // half-provisioned run, and the write lane must be explicitly ON.
  if (missing.length > 0) throw new BrainHarnessNotWiredError(missing)

  // No launcher injected = not wired. The SDK-backed launcher lives in operator tooling (apps/cli), never in
  // this package, so `@workspace/intake` carries no SDK dependency. Fail loud rather than fabricate a result.
  if (!inputs.launcher) {
    throw new BrainHarnessNotWiredError([
      "Agent-SDK session launcher (inject an AgentSessionLauncher; the @anthropic-ai/claude-agent-sdk-backed one lives in apps/cli)",
    ])
  }

  // Env is complete + the kill-switch is ON + a launcher is present. Derive the session config from the
  // INSPECTED plan (never untrusted document content) and delegate. The launcher owns the SDK session.
  return inputs.launcher.launch({
    systemPrompt: inputs.plan.loginPack.system,
    allowedTools: inputs.plan.loginPack.allowedTools,
    disallowedTools: inputs.plan.loginPack.disallowedTools,
    mcpEndpoint: inputs.mcpEndpoint,
    apiKey: inputs.readEnv(BRAIN_HARNESS_REQUIRED_ENV.apiKey)!,
    agentSdkAuth: inputs.readEnv(BRAIN_HARNESS_REQUIRED_ENV.agentSdkAuth)!,
    plan: inputs.plan,
  })
}
