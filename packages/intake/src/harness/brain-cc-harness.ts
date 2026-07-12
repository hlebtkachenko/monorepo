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
//   - M1.2 (the reasoning lane): the plan now schedules `classify_accounting_event` BETWEEN the discovery
//     reads and the capture write — reason the facts, then classify, then propose (see `planForCapture`).
//     Its planned input here is an ILLUSTRATIVE placeholder (the same pattern the two read calls already
//     use): a live session supplies the facts it actually reasoned from the document, which this creds-free
//     dry-run cannot fabricate without a real model. The dry-run `captureRequest` remains the exact,
//     source-verified WP-A adapter output (pre-classify). The M1.2-completion loop-close happens on the LIVE
//     path only: the launcher (`apps/cli` sdk-launcher.ts) records the server's classify result and threads
//     its treatment onto the submitted capture body deterministically at the `canUseTool` `updatedInput` seam
//     (`applyClassifyToCapture`), NARROW-ONLY and below the model — the model never edits the payload, and
//     every write is still HELD/gated by the server (a threaded special regime is held via
//     `unverified_vat_regime`). This creds-free dry-run has no classify result to thread, so it is unchanged.
//
//   - `runLiveBrainSession` — CREDS-GATED. It launches a real Claude Code session (Agent-SDK), which spawns a
//     LOCAL stdio MCP bridge pointed at the deployed REST API, and drives the session against the real tools +
//     the server gate.
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
  /**
   * The deployed REST API base URL (e.g. https://api.afframe.com). Consumed by the LOCAL stdio MCP bridge the
   * CLI spawns (as its `AFFRAME_API_BASE`) — the Brain reaches prod as an ordinary outbound HTTPS client, not
   * a hosted MCP endpoint. Var name kept as `BRAIN_MCP_ENDPOINT`; only its meaning is now the REST base.
   * `apps/cli` (`resolveBrainEnv`) defaults this to the production base when unset (M0.2a), so this gate
   * fires only if the CALLER's `readEnv` resolves an empty value — never on the raw env var's absence.
   */
  mcpEndpoint: "BRAIN_MCP_ENDPOINT",
  /** The Brain's server-authorized accounting API key (principal → org, server-injected tenancy). */
  apiKey: "BRAIN_API_KEY",
  /**
   * Agent-SDK auth. Bedrock spike uses AWS creds + `effort:xhigh`; subscription auth for dev sessions.
   * `apps/cli` (`resolveBrainEnv`) defaults this to the literal `"ambient"` when unset (M0.2a).
   */
  agentSdkAuth: "BRAIN_AGENT_SDK_AUTH",
} as const

// M0.2a (env-collapse): this gate used to ALSO require `BRAIN_RUNTIME_ACTIVE=1` + `BRAIN_LIVE` before ever
// reaching a launcher — a CLIENT-side pre-block duplicating the SERVER's real admission authority
// (`apps/api/src/v1/accounting/admission.singleton.ts`, `packages/db/src/admission.ts`), which fails closed
// on its own `BRAIN_RUNTIME_ACTIVE` kill-switch and HELDs every write at cold start regardless of what the
// client believes. Pre-blocking here bought no safety (the server gate is unchanged and still authoritative)
// and cost operators two extra env vars on every fresh session. Dropped: the client now always attempts, and
// the server decides — a run that hits an inactive write lane surfaces the server's `429 rate_limited`
// through the ordinary launcher result, which `apps/cli` renders as a clean lane-off message instead of a
// raw HTTP dump (see `renderLiveResult` / `isLaneOffOutcome` in `apps/cli/src/brain/session-config.ts`).

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
 * The operator-supplied context a POSTING (double-entry) session needs. Unlike the capture lane, the model is
 * NOT handed a verbatim write body — it reasons the předkontace and BUILDS the posting itself, so this carries
 * only the id envelope it stamps onto `create_accounting_posting`, never an account choice. `periodId` is a
 * REAL tenant účetní období; `summaryRecordId` / `accountingEventId` are operator-minted — a cold-start HELD
 * write commits nothing, so no real doklad/event row exists to reference (the server never checks these FKs on
 * the held path, and a held posting can never be applied with dangling FKs). `postingDate` is the účetní date
 * (the invoice tax point); `conversationId` PINS the audit + offline-scoring correlation and MUST be a UUID.
 */
export interface PostingSessionContext {
  /** REAL tenant účetní období id the posting is booked into. */
  periodId: string
  /** The doklad (summary_record) id the posting references — operator-minted on the cold-start held lane. */
  summaryRecordId: string
  /** The účetní případ (accounting_event) id the posting references — operator-minted on the held lane. */
  accountingEventId: string
  /** Datum (§5.2) — ISO date the posting is dated to (the invoice tax point). */
  postingDate: string
  /** The conversation_id = brain_run_id UUID; pins the audit + offline-scoring correlation. */
  conversationId: string
}

/**
 * A single-INVOICE POSTING session plan — the double-entry counterpart to `BrainDryRunPlan`. Where the capture
 * plan embeds a deterministic `captureRequest` the model submits VERBATIM, the posting plan deliberately does
 * NOT: it carries the raw `invoice` + the id envelope so the kickoff can ask the model to REASON the účet
 * předkontace (which cost account 501/518/504… against 321, plus 343 input VAT) and construct the balanced
 * `create_accounting_posting` body itself. That is the whole point of this lane (GAP-007): the model's account
 * choice is the thing under test, so it can never be pre-embedded. Structurally discriminated from
 * `BrainDryRunPlan` by the `posting` field (see `isPostingPlan`); the write is HELD by the SAME server gate as
 * every other write at cold start.
 */
export interface BrainPostingPlan {
  /** The WP-B login pack (system prompt + concrete allow/deny tool lists), same assembler as the capture lane. */
  loginPack: LoginContextPack
  /** The sandbox policy in force (the pinned per-TOOL accounting allowlist — already grants `list_accounts`). */
  policy: ToolAllowlistPolicy
  /** The ordered read → propose tool plan the live session executes (inspectable, creds-free). */
  toolPlan: PlannedToolCall[]
  /** The IR invoice the model must book — presented (curated) in the kickoff, NEVER a pre-chosen account. */
  invoice: Invoice
  /** The operator-supplied id + correlation envelope the model stamps onto the posting. */
  posting: PostingSessionContext
}

/** Either Brain live-session plan shape. Discriminated structurally by `isPostingPlan` (`"posting" in plan`). */
export type BrainSessionPlan = BrainDryRunPlan | BrainPostingPlan

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
 * Build the creds-free dry-run plan for ONE ALREADY-MAPPED capture request. This is the SINGLE source of
 * truth for the login pack + the fixed read → classify → propose tool sequence across every record kind
 * (invoice / bank / cash): the caller maps the IR record to a `CaptureAccountingDocumentRequest` via the
 * right WP-A adapter, and this assembles the plan the live session would drive with THAT request as the
 * write body.
 *
 * PURE. It (1) assembles the login pack via WP-B `buildLoginContext` (which embeds the sandbox policy and
 * fails closed on a self-contradictory policy), and (2) returns the ordered tool-call plan the live session
 * would execute, each call tagged with whether the sandbox allows it. NO live session is launched and NO MCP
 * endpoint is contacted — this is the plan, not the run.
 *
 * The plan a live run derives from this is DECIDED by the sandbox + the server gate, never by a document:
 * the tool set is fixed here (read structure/series → classify the reasoned facts → propose the capture
 * write), and the write is HELD or applied by the SERVER gate over infra signals, never by the model's
 * verbalized confidence. M1.2 inserts `classify_accounting_event` (a PURE, ungated decision call — no
 * mutation, no tenant read) between the reads and the write: the tool ORDER is fixed here exactly like the
 * two reads before it, but its real input (the facts a live session reasoned from the document) cannot be
 * fabricated in a creds-free dry run, so it carries the same illustrative placeholder shape the reads use.
 */
export function planForCapture(
  captureRequest: CaptureAccountingDocumentRequest,
  sections: LoginContextSections,
  policyOverride?: ToolAllowlistPolicy,
): BrainDryRunPlan {
  const policy = policyOverride ?? BRAIN_ACCOUNTING_POLICY

  // WP-B: assemble the login pack under this policy. `buildLoginContext` throws if the policy allows a
  // denied built-in (fail-closed), so a broken sandbox can never reach the plan.
  const loginPack = buildLoginContext({
    ...sections,
    toolPolicy: policy,
  })

  // The fixed tool-call plan for a single-document session. The reads locate the tenant-side rows the write
  // references (the harness supplies the resolved uuids in the capture request); classify is the reasoning
  // step (M1.2, pure decision, no mutation/tenant-read); the write is the ONLY mutation and it is subject to
  // the SERVER gate. Every tool name is the real `mcp__afframe__<tool>` name so the sandbox decision is
  // asserted verbatim, not approximated.
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
      "mcp__afframe__classify_accounting_event",
      "Reason the transaction facts from the document, then classify them into the accounting treatment " +
        "(vatMode/vatJurisdiction/vatRate/scenario) — a PURE decision, no mutation, no tenant read. A live " +
        "session supplies the facts it actually reasoned; this dry-run plan only fixes the tool's ORDER.",
      policy,
      { as: "reason" },
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

/**
 * Build the creds-free dry-run plan for a single-INVOICE Brain session — the thin wrapper that maps the IR
 * invoice through the WP-A adapter (which fabricates no VAT and emits no tenancy keys) and defers the login
 * pack + tool sequence to `planForCapture`. Its public behavior/signature is unchanged.
 */
export function planBrainDryRun(inputs: BrainDryRunInputs): BrainDryRunPlan {
  return planForCapture(
    invoiceToCapture(inputs.invoice, inputs.captureContext),
    inputs.sections,
    inputs.policy,
  )
}

/**
 * Build the creds-free plan for a single-INVOICE POSTING (double-entry) session. PURE. It assembles the SAME
 * login pack as the capture lane (`buildLoginContext` under the pinned `BRAIN_ACCOUNTING_POLICY`, which already
 * allows `list_accounts` + `create_accounting_posting`), then returns the ordered tool plan the live session
 * executes: confirm the structure, read the chart of accounts (to resolve each account number → its tenant id
 * while reasoning the předkontace), then PROPOSE the posting. Unlike `planForCapture`, NO write body is
 * pre-built — the invoice + id envelope ride in the plan and the model constructs the
 * `create_accounting_posting` body itself (the whole point of this lane, GAP-007). The write is HELD/applied by
 * the SERVER gate, never by the model; the client cannot force a green.
 */
export function planForPosting(
  invoice: Invoice,
  sections: LoginContextSections,
  posting: PostingSessionContext,
  policyOverride?: ToolAllowlistPolicy,
): BrainPostingPlan {
  const policy = policyOverride ?? BRAIN_ACCOUNTING_POLICY

  // Same fail-closed login-pack assembler as the capture lane (throws on a self-contradictory policy).
  const loginPack = buildLoginContext({ ...sections, toolPolicy: policy })

  // The fixed read → propose plan. `list_accounts` resolves account number → id for the předkontace; the
  // posting is the ONLY mutation and is subject to the SERVER gate. Every name is the real
  // `mcp__afframe__<tool>` name so the sandbox verdict is asserted verbatim.
  const toolPlan: PlannedToolCall[] = [
    tool(
      "mcp__afframe__get_structure",
      "Confirm the accounting period + structure the posting is booked into.",
      policy,
      { as: "read" },
    ),
    tool(
      "mcp__afframe__list_accounts",
      "Read the chart of accounts (účtový rozvrh) to resolve each account number to its tenant id.",
      policy,
      { as: "read" },
    ),
    tool(
      "mcp__afframe__create_accounting_posting",
      "Propose the reasoned double-entry posting. The SERVER gate scores + holds/applies it; the client " +
        "cannot force green.",
      policy,
      { as: "propose" },
    ),
  ]

  return { loginPack, policy, toolPlan, invoice, posting }
}

/** True when `plan` is a POSTING session plan (structurally discriminated by the `posting` envelope). */
export function isPostingPlan(
  plan: BrainSessionPlan,
): plan is BrainPostingPlan {
  return "posting" in plan
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
  /**
   * The inspected dry-run plan the session executes against the real tools. The launcher reads the WP-B login
   * pack's system prompt + concrete allow/deny tool lists from `plan.loginPack.{system,allowedTools,
   * disallowedTools}` DIRECTLY — a single source of truth, so the safety-critical sandbox deny-list cannot
   * diverge across the seam (the type makes a contradictory payload unrepresentable). Either lane's plan
   * shape (capture `BrainDryRunPlan` or `BrainPostingPlan`) — both expose the `loginPack` the launcher reads.
   */
  plan: BrainSessionPlan
  /** The deployed REST API base URL (e.g. https://api.afframe.com), consumed by the local stdio MCP bridge. */
  mcpEndpoint: string
  /** The Brain's server-authorized accounting API key (resolves org server-side; never a tool input). */
  apiKey: string
  /** Agent-SDK auth token (subscription for dev; AWS creds for the Bedrock spike). */
  agentSdkAuth: string
  /**
   * OPTIONAL deterministic idempotency key for the capture write. When the bulk orchestrator (M0.6) drives a
   * folder of many documents, it derives a STABLE per-document key (content hash) and threads it here so the
   * session's `capture_accounting_document` call carries EXACTLY that `Idempotency-Key`. Identical across a
   * retry and across a killed-and-resumed run, so the server's `tool_call_log` dedup collapses a re-book of
   * an already-applied document into a replay — never a double-book. Absent for a single-doc `brain run`
   * (the model then supplies its own key), so this change is additive + backward-compatible.
   */
  idempotencyKey?: string
  /**
   * OPTIONAL M2.1 model-routing signal: whether a workspace-CONFIRMED
   * `booking_template` matched this case's signature (server-verified via
   * `match_booking_template`, never client-claimed). `true` routes the
   * session to the cheap model (`@workspace/brain`'s `selectBrainModel`);
   * `false` or absent leaves the session's model UNSET — the launcher then
   * behaves EXACTLY as it does today (the Agent-SDK's own default), so a
   * caller that has not yet performed a template-match check (every caller
   * today) sees zero behavior change. Populating this is the M2.1
   * match-integration follow-up (the pre-session call to
   * `POST /v1/booking-templates/match`); this field only carries the signal
   * once that lands.
   */
  bookingTemplateMatched?: boolean
}

/**
 * The seam between the creds-gated harness gate (this package) and the Agent-SDK launch (operator tooling).
 * A launcher OWNS the `@anthropic-ai/claude-agent-sdk` session — it is injected so `@workspace/intake` NEVER
 * imports the SDK (not even `import type`), keeping the SDK out of this package's dependency graph. The
 * SDK-backed launcher belongs in `apps/cli` (to be added with the first live run); tests inject a mock.
 * `runLiveBrainSession` only reaches a launcher AFTER the creds gate passes. The write lane itself is gated
 * SERVER-side only (M0.2a dropped the redundant client pre-block) — a launcher can propose, but the server
 * still HELDs/rejects any write the deploy-time kill-switch has OFF.
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
  /** The session plan (capture `planBrainDryRun` or `planForPosting`) the live session executes. */
  plan: BrainSessionPlan
  /** The deployed REST API base URL (e.g. https://api.afframe.com), consumed by the local stdio MCP bridge. */
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
  /**
   * OPTIONAL deterministic idempotency key for the capture write (see `AgentSessionLaunchOptions`). Forwarded
   * verbatim to the launcher so the bulk orchestrator's stable per-document key reaches the server as the
   * `Idempotency-Key`. Absent for a single-doc run.
   */
  idempotencyKey?: string
  /** OPTIONAL M2.1 model-routing signal, forwarded verbatim (see `AgentSessionLaunchOptions`). */
  bookingTemplateMatched?: boolean
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
  /**
   * The parsed capture status string the launcher read back (`"applied"` / `"held"` / `"unknown"` /
   * `"unparsed"`). Surfaced so a caller can distinguish a genuine HELD write from a non-applied result that was
   * never a real hold — the bulk orchestrator (M0.6) records only a real `held` as a terminal success.
   */
  status: string
  /**
   * The held-write review handle. Present ONLY on a genuine HELD write. Its ABSENCE on a non-applied result is
   * the load-bearing signal that the result is NOT a real hold (a rate-limit / error / unparseable body), so it
   * must be recorded failed — never silently held (which would drop the document from the batch).
   */
  reviewId?: string
  /**
   * True when the capture tool result was an ERROR — an MCP `isError` result (rate-limit, 5xx, validation) OR
   * an unparseable body. An error result can NEVER be a genuine applied/held write.
   */
  isError: boolean
  /**
   * True when the error is specifically an admission rate-limit (`code=rate_limited`) surfaced IN-SESSION as a
   * tool error (not a thrown `RateLimitError`). Lets the batch engine's backoff/retry fire instead of failing
   * the document.
   */
  rateLimited: boolean
  /** The rate-limit's `retry_after` in MILLISECONDS, when the tool-error carried one. */
  retryAfterMs?: number
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
      "runLiveBrainSession cannot run: its creds gate is unmet or no Agent-SDK session launcher " +
        "was injected (the @anthropic-ai/claude-agent-sdk-backed launcher lives in apps/cli — NOT a dependency of " +
        `@workspace/intake). Missing/unmet: ${missing.join(", ")}. ` +
        "See docs/runbooks/BRAIN-CC-HARNESS.md for the wiring + first-live-run procedure.",
    )
    this.name = "BrainHarnessNotWiredError"
  }
}

/**
 * CREDS-GATED live-run entry point. It NEVER fakes a session:
 *
 *   1. It fails closed on the creds gate FIRST, before touching the launcher, naming exactly what is
 *      missing. (M0.2a: this used to ALSO require the client to see `BRAIN_RUNTIME_ACTIVE=1` + `BRAIN_LIVE`
 *      before ever reaching a launcher — a redundant pre-block, since the SERVER admission lane is the real,
 *      unweakened authority and HELDs/rejects every write at cold start regardless of the client. Dropped so
 *      the client always attempts and the server decides; see the note above `BRAIN_HARNESS_REQUIRED_ENV`.)
 *   2. Only then, if an `AgentSessionLauncher` was injected, does it delegate — handing the launcher the
 *      session config derived from the inspected dry-run plan. If no launcher was injected it fails closed
 *      (the SDK-backed launcher lives in `apps/cli`, so this package pulls in no SDK dependency).
 *
 * This is real wiring, not a stub: with a launcher + full env it launches the session and returns its
 * result; with anything unmet it fails loud. The SERVER gate still holds every write at cold start — the
 * launcher can only PROPOSE, never force a green (the auto-apply lane's three-way AND is server-side), and a
 * write the server's kill-switch has OFF still comes back as a rejected/held result, never a fabricated
 * success.
 */
export async function runLiveBrainSession(
  inputs: LiveBrainSessionInputs,
): Promise<LiveBrainSessionResult> {
  const missing: string[] = []

  // Fail-closed env gate. Read each required name ONCE into `values`; a missing one is named explicitly.
  const values: Record<string, string | undefined> = {}
  for (const envName of Object.values(BRAIN_HARNESS_REQUIRED_ENV)) {
    values[envName] = inputs.readEnv(envName)
    if (!values[envName]) missing.push(`env ${envName}`)
  }
  if (!inputs.mcpEndpoint)
    missing.push("deployed REST API base URL (inputs.mcpEndpoint)")

  // Fail closed on creds BEFORE the launcher is ever consulted — a launcher must never see a
  // half-provisioned run.
  if (missing.length > 0) throw new BrainHarnessNotWiredError(missing)

  // No launcher injected = not wired. The SDK-backed launcher belongs in operator tooling (apps/cli), never
  // in this package, so `@workspace/intake` carries no SDK dependency. Fail loud rather than fabricate a result.
  if (!inputs.launcher) {
    throw new BrainHarnessNotWiredError([
      "Agent-SDK session launcher (inject an AgentSessionLauncher; the @anthropic-ai/claude-agent-sdk-backed one belongs in apps/cli)",
    ])
  }

  // Narrow the two creds from the already-read `values` (no `!` casts, no re-read). The loop above guarantees
  // they are present — this guard is the type-level proof and also defends against a non-deterministic readEnv.
  const apiKey = values[BRAIN_HARNESS_REQUIRED_ENV.apiKey]
  const agentSdkAuth = values[BRAIN_HARNESS_REQUIRED_ENV.agentSdkAuth]
  if (!apiKey || !agentSdkAuth) {
    throw new BrainHarnessNotWiredError(["env re-read returned empty creds"])
  }

  // Creds are complete and a launcher is present. Hand the launcher the INSPECTED plan (it reads the login
  // pack's system prompt + allow/deny lists directly) + endpoint + creds, and delegate. The SERVER gate — not
  // this function — decides whether the write lane is open.
  // The optional deterministic idempotency key rides through so a bulk-orchestrated capture carries its
  // stable per-document `Idempotency-Key` (the server dedups a resumed re-book into a replay).
  return inputs.launcher.launch({
    plan: inputs.plan,
    mcpEndpoint: inputs.mcpEndpoint,
    apiKey,
    agentSdkAuth,
    idempotencyKey: inputs.idempotencyKey,
    bookingTemplateMatched: inputs.bookingTemplateMatched,
  })
}
