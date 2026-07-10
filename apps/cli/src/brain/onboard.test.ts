import { describe, expect, it, vi } from "vitest"
import type { OnboardingPlan } from "@workspace/intake"
import { fetchOnboardingPlan, renderOnboardingPlan } from "./onboard"

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  })
}

describe("fetchOnboardingPlan", () => {
  it("fetches periods + number-series and builds the plan (bookable org)", async () => {
    const fetchImpl = vi.fn((input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input)
      if (url.endsWith("/v1/accounting/periods")) {
        return Promise.resolve(
          jsonResponse({
            periods: [
              {
                id: "00000000-0000-4000-8000-000000000001",
                periodStart: "2025-01-01",
                periodEnd: "2025-12-31",
                status: "OPEN",
                regimeCode: "DOUBLE_ENTRY",
                accountingSizeCode: null,
                accountingCurrency: "CZK",
                fxRatePolicy: null,
              },
            ],
          }),
        )
      }
      if (url.endsWith("/v1/accounting/number-series")) {
        return Promise.resolve(
          jsonResponse({
            series: [
              {
                id: "00000000-0000-4000-8000-000000000002",
                entityType: "DOCUMENT",
                code: "FP",
                pattern: "FP{YYYY}{NNNN}",
                nextNumber: 1,
              },
              {
                id: "00000000-0000-4000-8000-000000000003",
                entityType: "EVENT",
                code: "UC",
                pattern: "UC{YYYY}{NNNNNN}",
                nextNumber: 1,
              },
            ],
          }),
        )
      }
      throw new Error(`unexpected fetch: ${url}`)
    })

    const plan = await fetchOnboardingPlan(
      "affk_test_fixture",
      "https://api.test.local",
      "2026-07-10",
      fetchImpl as unknown as typeof fetch,
    )

    expect(plan.report.bookable).toBe(true)
    expect(plan.proposedCalls).toEqual([])
    // Both endpoints were actually hit (discovery is real, not stubbed).
    const urls = fetchImpl.mock.calls.map((call) => {
      const input = call[0] as RequestInfo | URL
      return input instanceof Request ? input.url : String(input)
    })
    expect(urls).toEqual(
      expect.arrayContaining([
        "https://api.test.local/v1/accounting/periods",
        "https://api.test.local/v1/accounting/number-series",
      ]),
    )
  })

  it("threads `today` into the proposed create_accounting_period call for an unbookable org", async () => {
    const fetchImpl = vi.fn((input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input)
      if (url.endsWith("/v1/accounting/periods")) {
        return Promise.resolve(jsonResponse({ periods: [] }))
      }
      if (url.endsWith("/v1/accounting/number-series")) {
        return Promise.resolve(jsonResponse({ series: [] }))
      }
      throw new Error(`unexpected fetch: ${url}`)
    })

    const plan = await fetchOnboardingPlan(
      "affk_test_fixture",
      "https://api.test.local",
      "2026-07-10",
      fetchImpl as unknown as typeof fetch,
    )

    expect(plan.report.bookable).toBe(false)
    expect(plan.proposedCalls).toEqual([
      {
        tool: "create_accounting_period",
        purpose: expect.stringContaining("No OPEN accounting period"),
        request: { periodStart: "2026-07-10" },
      },
    ])
  })

  it("throws the typed AfframeApiError on a 401 (never silently reports unbookable)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "unauthorized",
            message: "Missing API key",
            requestId: "req-1",
          },
        },
        { status: 401 },
      ),
    )
    await expect(
      fetchOnboardingPlan(
        "bad-key",
        "https://api.test.local",
        "2026-07-10",
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({ name: "UnauthorizedError" })
  })
})

describe("renderOnboardingPlan", () => {
  it("renders a bookable org with no proposed calls", () => {
    const plan: OnboardingPlan = {
      report: {
        bookable: true,
        hasOpenPeriod: true,
        requiredEntityTypes: ["DOCUMENT", "EVENT"],
        missingSeriesEntityTypes: [],
      },
      explanation:
        "This organization is bookable: it has an OPEN accounting period.",
      proposedCalls: [],
    }
    const rendered = renderOnboardingPlan(plan)
    expect(rendered).toContain("bookability discovery")
    expect(rendered).toContain("This organization is bookable")
    expect(rendered).not.toContain("Proposed calls")
  })

  it("renders every proposed call's tool, purpose, and verbatim request body", () => {
    const plan: OnboardingPlan = {
      report: {
        bookable: false,
        hasOpenPeriod: true,
        requiredEntityTypes: ["DOCUMENT", "EVENT"],
        missingSeriesEntityTypes: ["EVENT"],
      },
      explanation:
        "This organization is NOT bookable yet — it is missing a number series for: EVENT.",
      proposedCalls: [
        {
          tool: "create_number_series",
          purpose: "Missing a EVENT number series.",
          request: {
            entityType: "EVENT",
            code: "UC",
            pattern: "UC{YYYY}{NNNNNN}",
          },
        },
      ],
    }
    const rendered = renderOnboardingPlan(plan)
    expect(rendered).toContain("Proposed calls to fix it (1)")
    expect(rendered).toContain(
      "[1] create_number_series — Missing a EVENT number series.",
    )
    expect(rendered).toContain('"entityType": "EVENT"')
    expect(rendered).toContain('"code": "UC"')
  })
})
