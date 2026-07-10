// M1.4 — the `afframe brain onboard` operator command: discover whether THIS organization (the one the
// resolved `BRAIN_API_KEY` belongs to) is bookable, print the exact create-tool calls that would fix it,
// and (only with the explicit `--execute` flag + a confirmation gate) actually run them.
//
// READ-ONLY discovery + creds-light: this command makes exactly two live GETs (`GET /v1/accounting/periods`,
// `GET /v1/accounting/number-series`) — the SAME two reads already on the Brain booking session's read
// allowlist (`packages/brain/src/agent/sandbox.ts`: `list_accounting_number_series`; `get_structure`
// surfaces periods). Discovery never calls a write endpoint, never spawns an Agent-SDK session, and never
// touches the sandbox tool policy — the guided-create step (`@workspace/intake`'s `planOnboarding`) only
// PROPOSES the `create_accounting_period` / `create_number_series` bodies, mirroring the `--dry-run`
// "inspect before running" convention `brain run` / `brain book` already use.
//
// `--execute` (M1.4 completion) POSTs those already-assembled proposals verbatim via the SAME
// `createAfframeClient` instance discovery built (no second client), using the operator's own
// `BRAIN_API_KEY` — the write authority is the operator's key (`accounting:write` scope), not an expanded
// agent capability. This is still plain operator-driven CLI execution: no agent session, no sandbox-
// allowlist change. Wiring this into a real conversational session (riding the M1.2 reasoning lane) remains
// explicit follow-up.

import { createAfframeClient, type AfframeClient } from "@afframe/sdk"
import {
  planOnboarding,
  type OnboardingPlan,
  type ProposedOnboardingCall,
} from "@workspace/intake"
import type {
  CreateAccountingPeriodRequest,
  CreateAccountingPeriodResponse,
  CreateNumberSeriesRequest,
  CreateNumberSeriesResponse,
} from "@workspace/shared/api"
import { indent } from "./render"

/** `fetchOnboardingPlan`'s result: the assembled plan, plus the client discovery already built (so `--execute` reuses it — never a second client). */
export interface OnboardingDiscovery {
  plan: OnboardingPlan
  client: AfframeClient
}

/**
 * Fetch the org's periods + number series live (via the resolved API key/base) and build the onboarding
 * plan. The only impure part of this feature — everything past the fetch (`planOnboarding`) is pure and
 * unit-tested without a network call. `fetchImpl` defaults to `createAfframeClient`'s own default
 * (`globalThis.fetch`); tests inject a mock so no real network call ever fires. Returns the `client`
 * alongside the plan so a subsequent `--execute` reuses the exact same instance.
 */
export async function fetchOnboardingPlan(
  apiKey: string,
  baseUrl: string,
  today: string,
  fetchImpl?: typeof fetch,
): Promise<OnboardingDiscovery> {
  const client = createAfframeClient({ apiKey, baseUrl, fetch: fetchImpl })

  const periodsRes = await client.GET("/v1/accounting/periods")
  if (periodsRes.error) throw periodsRes.error
  const seriesRes = await client.GET("/v1/accounting/number-series")
  if (seriesRes.error) throw seriesRes.error

  const plan = planOnboarding({
    periods: periodsRes.data.periods,
    series: seriesRes.data.series,
    today,
  })
  return { plan, client }
}

/**
 * Render the assembled onboarding plan for operator inspection: the discovery explanation, then (only when
 * not yet bookable) every proposed call's tool name + reason + verbatim request body — the exact text a
 * human would need to run `create_accounting_period` / `create_number_series` themselves.
 */
export function renderOnboardingPlan(plan: OnboardingPlan): string {
  const lines: string[] = []
  lines.push(
    "Afframe brain onboard — bookability discovery (read-only; proposals below are NOT executed).",
  )
  lines.push("")
  lines.push(plan.explanation)

  if (plan.proposedCalls.length > 0) {
    lines.push("")
    lines.push(
      `Proposed calls to fix it (${plan.proposedCalls.length}) — run these yourself (CLI/API), verbatim:`,
    )
    plan.proposedCalls.forEach((call, index) => {
      lines.push("")
      lines.push(`  [${index + 1}] ${call.tool} — ${call.purpose}`)
      lines.push(indent(JSON.stringify(call.request, null, 2), 6))
    })
  }

  return lines.join("\n") + "\n"
}

/** One executed onboarding call's outcome — always recorded, whether it succeeded or failed. */
export type OnboardingExecuteResult =
  | {
      call: ProposedOnboardingCall
      status: "created"
      response: CreateAccountingPeriodResponse | CreateNumberSeriesResponse
    }
  | {
      call: ProposedOnboardingCall
      status: "failed"
      /** The error's message (an `AfframeApiError` subclass surfaces its `code`/`message` here). */
      error: string
    }

/**
 * Execute the plan's `proposedCalls` VERBATIM against the real create endpoints, via the SAME client
 * `fetchOnboardingPlan` already built (never a second client, never a re-derived body). Each call is
 * independent — `create_accounting_period` → `POST /v1/accounting/periods`, `create_number_series` →
 * `POST /v1/accounting/number-series` (confirmed against `OnboardingController`'s routes and the generated
 * MCP tools `createAccountingPeriod.ts` / `createNumberSeries.ts`, which POST to these exact paths). A
 * failed call is caught and recorded rather than aborting the loop, so one bad create never hides the
 * outcome of the others — the caller sees exactly which calls landed and which didn't.
 *
 * `confirm` is the injected gate (the CLI passes its readline-based `confirmOnboardingExecute`, mirroring
 * `confirmLiveRun`'s exact TTY/decline behavior) — called ONLY when there is at least one call to run, so a
 * caller never sees a confirmation prompt for an already-bookable org. Returns `null` when the operator
 * declines (nothing was executed) or the plan has nothing to do; otherwise the per-call outcomes.
 */
export async function executeOnboardingPlan(
  plan: OnboardingPlan,
  client: AfframeClient,
  confirm: (plan: OnboardingPlan) => Promise<boolean>,
): Promise<OnboardingExecuteResult[] | null> {
  if (plan.proposedCalls.length === 0) return []
  if (!(await confirm(plan))) return null

  const results: OnboardingExecuteResult[] = []

  for (const call of plan.proposedCalls) {
    try {
      if (call.tool === "create_accounting_period") {
        const res = await client.POST("/v1/accounting/periods", {
          body: call.request as CreateAccountingPeriodRequest,
        })
        if (res.error) throw res.error
        results.push({ call, status: "created", response: res.data })
      } else {
        const res = await client.POST("/v1/accounting/number-series", {
          body: call.request as CreateNumberSeriesRequest,
        })
        if (res.error) throw res.error
        results.push({ call, status: "created", response: res.data })
      }
    } catch (err) {
      results.push({
        call,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return results
}

/**
 * Render `executeOnboardingPlan`'s outcome for operator inspection: every call's tool name + status, the
 * created id(s) on success, or the surfaced error message on failure — so a partial failure never leaves the
 * operator guessing which creates actually landed.
 */
export function renderOnboardingExecuteResults(
  results: OnboardingExecuteResult[],
): string {
  const lines: string[] = []
  lines.push(
    `Executed ${results.length} proposed call(s) — immediately-applied writes:`,
  )
  results.forEach((result, index) => {
    lines.push("")
    if (result.status === "created") {
      lines.push(`  [${index + 1}] ${result.call.tool} — CREATED`)
      lines.push(indent(JSON.stringify(result.response, null, 2), 6))
    } else {
      lines.push(`  [${index + 1}] ${result.call.tool} — FAILED: ${result.error}`)
    }
  })
  const failedCount = results.filter((r) => r.status === "failed").length
  lines.push("")
  lines.push(
    failedCount === 0
      ? `All ${results.length} call(s) succeeded.`
      : `${results.length - failedCount}/${results.length} call(s) succeeded — ${failedCount} failed (see above).`,
  )
  return lines.join("\n") + "\n"
}
