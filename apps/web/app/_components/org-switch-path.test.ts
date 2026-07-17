import { describe, expect, it } from "vitest"

import { orgSwitchPath } from "./org-switch-path"

describe("orgSwitchPath", () => {
  it("maps the org root to the target root", () => {
    expect(orgSwitchPath("/acme", "north")).toBe("/north")
  })

  it("carries a static module/page/subpage path across", () => {
    expect(orgSwitchPath("/acme/accounting/ledger", "north")).toBe(
      "/north/accounting/ledger",
    )
  })

  it("drops a trailing UUID record-id back to the subpage", () => {
    expect(
      orgSwitchPath(
        "/acme/accounting/ledger/9f8c4b2a-1d3e-4f5a-8b6c-0a1b2c3d4e5f",
        "north",
      ),
    ).toBe("/north/accounting/ledger")
  })

  it("drops a trailing numeric record-id", () => {
    expect(orgSwitchPath("/acme/billing/invoices/12345", "north")).toBe(
      "/north/billing/invoices",
    )
  })

  it("drops a long opaque (ulid/nanoid) record-id", () => {
    expect(
      orgSwitchPath("/acme/documents/01HZY8Q9V3K7M2N4P6R8T0W1XA", "north"),
    ).toBe("/north/documents")
  })

  it("drops the query string (record handle) even without an id segment", () => {
    expect(orgSwitchPath("/acme/accounting/ledger?inspect=xyz", "north")).toBe(
      "/north/accounting/ledger",
    )
  })

  it("peels multiple stacked record-id segments", () => {
    expect(orgSwitchPath("/acme/accounting/ledger/12345/67890", "north")).toBe(
      "/north/accounting/ledger",
    )
  })

  it("keeps short static leaf words (not record-ids)", () => {
    expect(orgSwitchPath("/acme/settings/periods", "north")).toBe(
      "/north/settings/periods",
    )
  })
})
