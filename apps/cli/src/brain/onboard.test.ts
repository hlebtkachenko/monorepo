import { describe, expect, it, vi } from "vitest"
import type { AfframeClient } from "@afframe/sdk"
import type { OnboardingPlan, ProposedOnboardingCall } from "@workspace/intake"
import {
  executeOnboardingPlan,
  fetchOnboardingPlan,
  renderOnboardingExecuteResults,
  renderOnboardingPlan,
} from "./onboard"

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

    const { plan } = await fetchOnboardingPlan(
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

    const { plan } = await fetchOnboardingPlan(
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

const PERIOD_CALL: ProposedOnboardingCall = {
  tool: "create_accounting_period",
  purpose: "No OPEN accounting period exists.",
  request: { periodStart: "2026-07-10" },
}

const SERIES_CALL: ProposedOnboardingCall = {
  tool: "create_number_series",
  purpose: "Missing a EVENT number series.",
  request: { entityType: "EVENT", code: "UC", pattern: "UC{YYYY}{NNNNNN}" },
}

function makeOnboardingPlan(
  proposedCalls: ProposedOnboardingCall[],
): OnboardingPlan {
  return {
    report: {
      bookable: proposedCalls.length === 0,
      hasOpenPeriod: !proposedCalls.some(
        (call) => call.tool === "create_accounting_period",
      ),
      requiredEntityTypes: ["DOCUMENT", "EVENT"],
      missingSeriesEntityTypes: [],
    },
    explanation: "test plan",
    proposedCalls,
  }
}

describe("executeOnboardingPlan", () => {
  it("POSTs create_accounting_period to /v1/accounting/periods with the verbatim body", async () => {
    const post = vi.fn(async (path: string) => {
      expect(path).toBe("/v1/accounting/periods")
      return {
        data: {
          periodId: "00000000-0000-4000-8000-000000000001",
          regimeCode: "DOUBLE_ENTRY",
          periodStart: "2026-07-10",
          periodEnd: "2026-12-31",
          chartId: "00000000-0000-4000-8000-000000000002",
          accountsSeeded: 218,
          seriesCreated: 8,
        },
        error: undefined,
      }
    })
    const client = { POST: post } as unknown as AfframeClient
    const plan = makeOnboardingPlan([PERIOD_CALL])

    const results = await executeOnboardingPlan(plan, client, async () => true)

    expect(post).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledWith("/v1/accounting/periods", {
      body: PERIOD_CALL.request,
    })
    expect(results).toEqual([
      {
        call: PERIOD_CALL,
        status: "created",
        response: expect.objectContaining({
          periodId: "00000000-0000-4000-8000-000000000001",
        }),
      },
    ])
  })

  it("POSTs create_number_series to /v1/accounting/number-series with the verbatim body", async () => {
    const post = vi.fn(async (path: string) => {
      expect(path).toBe("/v1/accounting/number-series")
      return {
        data: {
          series: {
            id: "00000000-0000-4000-8000-000000000003",
            entityType: "EVENT",
            code: "UC",
            pattern: "UC{YYYY}{NNNNNN}",
            nextNumber: 1,
          },
        },
        error: undefined,
      }
    })
    const client = { POST: post } as unknown as AfframeClient
    const plan = makeOnboardingPlan([SERIES_CALL])

    const results = await executeOnboardingPlan(plan, client, async () => true)

    expect(post).toHaveBeenCalledWith("/v1/accounting/number-series", {
      body: SERIES_CALL.request,
    })
    expect(results).not.toBeNull()
    expect(results?.[0]).toMatchObject({
      call: SERIES_CALL,
      status: "created",
    })
  })

  it("declining the confirm gate executes nothing", async () => {
    const post = vi.fn()
    const client = { POST: post } as unknown as AfframeClient
    const plan = makeOnboardingPlan([PERIOD_CALL])

    const results = await executeOnboardingPlan(plan, client, async () => false)

    expect(results).toBeNull()
    expect(post).not.toHaveBeenCalled()
  })

  it("skips the confirm gate entirely when there is nothing to execute", async () => {
    const confirm = vi.fn(async () => true)
    const post = vi.fn()
    const client = { POST: post } as unknown as AfframeClient
    const plan = makeOnboardingPlan([])

    const results = await executeOnboardingPlan(plan, client, confirm)

    expect(results).toEqual([])
    expect(confirm).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })

  it("records a failed call and keeps executing the rest (partial failure never hides successes)", async () => {
    const post = vi.fn(async (path: string) => {
      if (path === "/v1/accounting/periods") {
        const err = new Error("Period overlaps an existing period")
        err.name = "ConflictError"
        throw err
      }
      return {
        data: {
          series: {
            id: "00000000-0000-4000-8000-000000000003",
            entityType: "EVENT",
            code: "UC",
            pattern: "UC{YYYY}{NNNNNN}",
            nextNumber: 1,
          },
        },
        error: undefined,
      }
    })
    const client = { POST: post } as unknown as AfframeClient
    const plan = makeOnboardingPlan([PERIOD_CALL, SERIES_CALL])

    const results = await executeOnboardingPlan(plan, client, async () => true)

    expect(results).toEqual([
      {
        call: PERIOD_CALL,
        status: "failed",
        error: "Period overlaps an existing period",
      },
      {
        call: SERIES_CALL,
        status: "created",
        response: expect.objectContaining({
          series: expect.objectContaining({ entityType: "EVENT" }),
        }),
      },
    ])
  })
})

describe("renderOnboardingExecuteResults", () => {
  it("renders every call's status and reports a clean all-succeeded summary", () => {
    const rendered = renderOnboardingExecuteResults([
      {
        call: PERIOD_CALL,
        status: "created",
        response: {
          periodId: "00000000-0000-4000-8000-000000000001",
          regimeCode: "DOUBLE_ENTRY",
          periodStart: "2026-07-10",
          periodEnd: "2026-12-31",
          chartId: "00000000-0000-4000-8000-000000000002",
          accountsSeeded: 218,
          seriesCreated: 8,
        },
      },
    ])
    expect(rendered).toContain("[1] create_accounting_period — CREATED")
    expect(rendered).toContain("All 1 call(s) succeeded.")
  })

  it("surfaces a failed call's error message and reports a partial-failure summary", () => {
    const rendered = renderOnboardingExecuteResults([
      {
        call: PERIOD_CALL,
        status: "failed",
        error: "Period overlaps an existing period",
      },
      {
        call: SERIES_CALL,
        status: "created",
        response: {
          series: {
            id: "00000000-0000-4000-8000-000000000003",
            entityType: "EVENT",
            code: "UC",
            pattern: "UC{YYYY}{NNNNNN}",
            nextNumber: 1,
          },
        },
      },
    ])
    expect(rendered).toContain(
      "[1] create_accounting_period — FAILED: Period overlaps an existing period",
    )
    expect(rendered).toContain("[2] create_number_series — CREATED")
    expect(rendered).toContain("1/2 call(s) succeeded — 1 failed (see above).")
  })
})
