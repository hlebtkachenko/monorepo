// M1.4 — the onboarding GUIDED-CREATE harness: given a discovered `BookabilityReport`, PROPOSE (never
// execute) the exact `create_accounting_period` / `create_number_series` call bodies that would fix an
// unbookable organization, plus a natural-language explanation of why.
//
// This is deliberately the SMALLEST correct slice of the M1.4 "conversational onboarding wizard":
//   - Discovery is real (the CLI performs two live GETs — `list_accounting_periods` / `list_accounting_
//     number_series` — the SAME reads already on the Brain booking session's allowlist, see
//     `packages/brain/src/agent/sandbox.ts`).
//   - The guided-create step only PROPOSES: it prints the tool name + a human-readable reason + the exact
//     request body, mirroring the `--dry-run` "inspect before running" convention every other Brain CLI
//     command uses (`brain run --dry-run`, `brain book --dry-run`, `planBrainDryRun`/`planForCapture` in
//     `./brain-cc-harness`). It does NOT call the create endpoints itself, and it does NOT spawn an agent
//     session — there is no document in the loop and no prompt-injection surface, so the agent sandbox
//     policy (`BRAIN_ACCOUNTING_POLICY`) is untouched by this module and by this milestone item.
//   - Wiring this into an actual live conversational session (an agent proposing + a human confirming
//     through the SDK, riding the M1.2 reasoning lane) is explicit FOLLOW-UP — see M1.4 in
//     `.context/afframe-brain/BRAIN-MILESTONE-PLAN.md`.
//
// PURE: no I/O, no network, no agent-SDK dependency. `today` is threaded in by the caller (the CLI reads
// the clock; this module never does) so the proposal is deterministic and unit-testable.

import type {
  CreateAccountingPeriodRequest,
  CreateNumberSeriesRequest,
} from "@workspace/shared/api"
import {
  discoverBookability,
  explainBookability,
  type BookabilityReport,
  type NumberSeriesEntityType,
  type NumberSeriesLike,
  type PeriodLike,
} from "@workspace/brain"

/**
 * A MINIMAL, MIRRORED copy of `packages/accounting/src/number-series-defaults.ts`'s canonical
 * `DEFAULT_NUMBER_SERIES`, restricted to the two entity types a bookability gap can name (DOCUMENT, EVENT
 * — see `@workspace/brain`'s `BOOKING_REQUIRED_SERIES_ENTITY_TYPES`). Duplicated rather than imported:
 * `@workspace/accounting` depends on `@workspace/db` (a live Postgres driver + RLS session variables) —
 * pulling it into `@workspace/intake` / `apps/cli` (operator tooling that is a plain REST/MCP client with
 * NO database access, per the Brain "unprivileged outside API-key holder" boundary, A-Z §2/§3.2) would be
 * an architecture violation, not a convenience. This catalogue is a statutory/UI-facing naming convention
 * that changes rarely; keep the two lists in sync by hand.
 */
export const ONBOARDING_DEFAULT_NUMBER_SERIES = [
  { entityType: "EVENT", code: "UC", pattern: "UC{YYYY}{NNNNNN}" },
  { entityType: "DOCUMENT", code: "FV", pattern: "FV{YYYY}{NNNN}" },
  { entityType: "DOCUMENT", code: "FP", pattern: "FP{YYYY}{NNNN}" },
  { entityType: "DOCUMENT", code: "PD", pattern: "PD{YYYY}{NNNN}" },
  { entityType: "DOCUMENT", code: "BV", pattern: "BV{YYYY}{NNNN}" },
  { entityType: "DOCUMENT", code: "ID", pattern: "ID{YYYY}{NNNN}" },
] as const satisfies readonly {
  entityType: NumberSeriesEntityType
  code: string
  pattern: string
}[]

/** One proposed onboarding write — the real MCP/REST tool name + why + the exact verbatim request body. */
export interface ProposedOnboardingCall {
  /** The real tool/endpoint this mirrors (`create_accounting_period` → `POST /v1/accounting/periods`; `create_number_series` → `POST /v1/accounting/number-series`). */
  tool: "create_accounting_period" | "create_number_series"
  /** Natural-language reason a human (or a future conversational session) would run this call. */
  purpose: string
  /** The exact request body — feed this verbatim to the endpoint/tool. Never auto-executed by this module. */
  request: CreateAccountingPeriodRequest | CreateNumberSeriesRequest
}

/** The assembled onboarding plan: the discovery result, its explanation, and what (if anything) to propose. */
export interface OnboardingPlan {
  report: BookabilityReport
  explanation: string
  /** Empty iff `report.bookable`. */
  proposedCalls: ProposedOnboardingCall[]
}

export interface OnboardingPlanInputs {
  /** The org's periods, as already fetched via `GET /v1/accounting/periods`. */
  periods: readonly PeriodLike[]
  /** The org's number series, as already fetched via `GET /v1/accounting/number-series`. */
  series: readonly NumberSeriesLike[]
  /** ISO date (YYYY-MM-DD) the caller resolves from `new Date()` — kept a parameter so this stays clock-free. */
  today: string
  /** Narrows the bookability bar. Defaults to `BOOKING_REQUIRED_SERIES_ENTITY_TYPES` (DOCUMENT, EVENT). */
  requiredEntityTypes?: readonly NumberSeriesEntityType[]
}

/**
 * Build the creds-free, execution-free onboarding plan: discover bookability, then propose the minimal fix.
 *
 * - No open period → propose ONE `create_accounting_period` call (only `periodStart` is required; every
 *   other field is optional/derived server-side — see `CreateAccountingPeriodRequestSchema`). Opening a
 *   period also seeds ALL default number series via the coupled scaffold (`scaffoldAccountingPeriod` →
 *   `backfillDefaultNumberSeries`), so a series gap is NOT separately proposed in this branch — fixing the
 *   period fixes both at once.
 * - An OPEN period exists but a required series is missing (the legacy/partial-provisioning case, #579) →
 *   propose one `create_number_series` call per missing entity type, using the canonical default code +
 *   pattern for that type.
 */
export function planOnboarding(inputs: OnboardingPlanInputs): OnboardingPlan {
  const report = discoverBookability(
    inputs.periods,
    inputs.series,
    inputs.requiredEntityTypes,
  )
  const explanation = explainBookability(report)
  const proposedCalls: ProposedOnboardingCall[] = []

  if (!report.hasOpenPeriod) {
    proposedCalls.push({
      tool: "create_accounting_period",
      purpose:
        "No OPEN accounting period exists — nothing can be booked. Opening one also seeds the " +
        "organization's default number series automatically, which covers any series gap reported above.",
      request: {
        periodStart: inputs.today,
      } satisfies CreateAccountingPeriodRequest,
    })
  } else {
    for (const entityType of report.missingSeriesEntityTypes) {
      for (const series of ONBOARDING_DEFAULT_NUMBER_SERIES) {
        if (series.entityType !== entityType) continue
        proposedCalls.push({
          tool: "create_number_series",
          purpose: `Missing a ${entityType} number series — required before this organization can book via ${
            entityType === "DOCUMENT"
              ? "capture_accounting_document"
              : "create_accounting_event"
          }.`,
          request: {
            entityType: series.entityType,
            code: series.code,
            pattern: series.pattern,
          } satisfies CreateNumberSeriesRequest,
        })
      }
    }
  }

  return { report, explanation, proposedCalls }
}
