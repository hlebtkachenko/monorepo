import { describe, it, expect } from "vitest"

import { ORG_PREFIX, orgBasePath, orgHref } from "./href"

describe("orgHref", () => {
  it("org home is the prefixed base path", () => {
    expect(orgBasePath("acme")).toBe("/o/acme")
    expect(orgHref("acme")).toBe("/o/acme")
    expect(ORG_PREFIX).toBe("/o")
  })

  it("appends an org-relative path", () => {
    expect(orgHref("acme", "accounting/journal")).toBe(
      "/o/acme/accounting/journal",
    )
  })

  it("ignores leading slashes on the path", () => {
    expect(orgHref("acme", "/settings")).toBe("/o/acme/settings")
  })

  it("appends an encoded period query when provided", () => {
    expect(orgHref("acme", "accounting/journal", { period: "p 1" })).toBe(
      "/o/acme/accounting/journal?period=p%201",
    )
    expect(orgHref("acme", "", { period: "2026-Q1" })).toBe(
      "/o/acme?period=2026-Q1",
    )
  })

  it("omits the query for null/undefined period", () => {
    expect(orgHref("acme", "reports", { period: null })).toBe("/o/acme/reports")
    expect(orgHref("acme", "reports", {})).toBe("/o/acme/reports")
  })
})
