import { describe, expect, it } from "vitest"

import { firstLoginPath } from "./first-login"

describe("firstLoginPath", () => {
  it("sends an owner grant to the root picker, even inside a specific org", () => {
    expect(
      firstLoginPath({ organizationSlug: "acme-sro", grantedRole: "owner" }),
    ).toBe("/")
  })

  it("sends admin, member and guest straight into the org", () => {
    for (const role of ["admin", "member", "guest"] as const) {
      expect(
        firstLoginPath({ organizationSlug: "acme-sro", grantedRole: role }),
      ).toBe("/acme-sro")
    }
  })

  it("sends an org-less grant to the root (account_setup with no org, password_reset)", () => {
    expect(firstLoginPath({ organizationSlug: null, grantedRole: null })).toBe(
      "/",
    )
  })

  it("falls back to the root on an inconsistent pairing rather than guessing", () => {
    // The DB CHECK (`user_setup_token_scope_pairing`) never actually produces
    // one of the slug/role fields null and the other not — but the function
    // does not trust that from the outside; either being null is enough to
    // refuse a scoped redirect.
    expect(
      firstLoginPath({ organizationSlug: "acme-sro", grantedRole: null }),
    ).toBe("/")
    expect(
      firstLoginPath({ organizationSlug: null, grantedRole: "member" }),
    ).toBe("/")
  })
})
