import { describe, expect, it } from "vitest"

import { orgSwitchTarget } from "./switch-path"

describe("orgSwitchTarget", () => {
  it("maps the org root to the target root", () => {
    expect(orgSwitchTarget("/o/acme", "acme", "north")).toBe("/o/north")
  })

  it("carries a static module/page/subpage path across", () => {
    expect(orgSwitchTarget("/o/acme/accounting/ledger", "acme", "north")).toBe(
      "/o/north/accounting/ledger",
    )
  })

  it("preserves a deep sub-path (F16 example)", () => {
    expect(orgSwitchTarget("/o/acme/company/periods", "acme", "north")).toBe(
      "/o/north/company/periods",
    )
  })

  it("drops the ?period= query (period ids are org-scoped)", () => {
    expect(
      orgSwitchTarget(
        "/o/acme/accounting/ledger?period=2026-Q1",
        "acme",
        "north",
      ),
    ).toBe("/o/north/accounting/ledger")
  })

  it("drops the period query on the org root too", () => {
    expect(orgSwitchTarget("/o/acme?period=2026-Q1", "acme", "north")).toBe(
      "/o/north",
    )
  })

  it("drops any other query (per-page/record handle)", () => {
    expect(
      orgSwitchTarget("/o/acme/documents?tab=inbox&q=x", "acme", "north"),
    ).toBe("/o/north/documents")
  })

  it("preserves a trailing record-id (target not-found handles it)", () => {
    expect(
      orgSwitchTarget(
        "/o/acme/accounting/ledger/9f8c4b2a-1d3e-4f5a-8b6c-0a1b2c3d4e5f",
        "acme",
        "north",
      ),
    ).toBe("/o/north/accounting/ledger/9f8c4b2a-1d3e-4f5a-8b6c-0a1b2c3d4e5f")
  })

  it("falls back to the target root when the path is not under the source org", () => {
    expect(orgSwitchTarget("/workspace/profile", "acme", "north")).toBe(
      "/o/north",
    )
  })
})
