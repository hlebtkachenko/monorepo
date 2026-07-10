// M1.4 — the `afframe brain onboard` operator command: discover whether THIS organization (the one the
// resolved `BRAIN_API_KEY` belongs to) is bookable, and, if not, print the exact create-tool calls that
// would fix it.
//
// READ-ONLY + creds-light: this command makes exactly two live GETs (`GET /v1/accounting/periods`,
// `GET /v1/accounting/number-series`) — the SAME two reads already on the Brain booking session's read
// allowlist (`packages/brain/src/agent/sandbox.ts`: `list_accounting_number_series`; `get_structure`
// surfaces periods). It never calls a write endpoint, never spawns an Agent-SDK session, and never touches
// the sandbox tool policy — the guided-create step (`@workspace/intake`'s `planOnboarding`) only PROPOSES
// the `create_accounting_period` / `create_number_series` bodies an operator would run next, mirroring the
// `--dry-run` "inspect before running" convention `brain run` / `brain book` already use. Executing the
// proposal live (with a confirmation gate, like `brain book`) or wiring it into a real conversational
// session (riding the M1.2 reasoning lane) is explicit follow-up, not part of this slice.

import { createAfframeClient } from "@afframe/sdk"
import { planOnboarding, type OnboardingPlan } from "@workspace/intake"
import { indent } from "./render"

/**
 * Fetch the org's periods + number series live (via the resolved API key/base) and build the onboarding
 * plan. The only impure part of this feature — everything past the fetch (`planOnboarding`) is pure and
 * unit-tested without a network call. `fetchImpl` defaults to `createAfframeClient`'s own default
 * (`globalThis.fetch`); tests inject a mock so no real network call ever fires.
 */
export async function fetchOnboardingPlan(
  apiKey: string,
  baseUrl: string,
  today: string,
  fetchImpl?: typeof fetch,
): Promise<OnboardingPlan> {
  const client = createAfframeClient({ apiKey, baseUrl, fetch: fetchImpl })

  const periodsRes = await client.GET("/v1/accounting/periods")
  if (periodsRes.error) throw periodsRes.error
  const seriesRes = await client.GET("/v1/accounting/number-series")
  if (seriesRes.error) throw seriesRes.error

  return planOnboarding({
    periods: periodsRes.data.periods,
    series: seriesRes.data.series,
    today,
  })
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
