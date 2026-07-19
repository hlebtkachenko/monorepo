import { describe, expect, it } from "vitest"
import { decideTokenOrganization } from "./oauth-tenant-binding"

const ORG_A = "11111111-1111-7111-8111-111111111111"
const ORG_B = "22222222-2222-7222-8222-222222222222"
const ORG_C = "33333333-3333-7333-8333-333333333333"

describe("decideTokenOrganization", () => {
  it("no active memberships -> no_organization (cannot mint an org-bound token)", () => {
    expect(decideTokenOrganization([], null)).toEqual({
      ok: false,
      reason: "no_organization",
    })
    // A stale pending choice must not rescue a user with zero live memberships.
    expect(decideTokenOrganization([], ORG_A)).toEqual({
      ok: false,
      reason: "no_organization",
    })
  })

  it("exactly one active membership -> bind to it, no selection needed", () => {
    expect(decideTokenOrganization([ORG_A], null)).toEqual({
      ok: true,
      organizationId: ORG_A,
    })
    // Single membership wins even if a pending row points elsewhere/stale.
    expect(decideTokenOrganization([ORG_A], ORG_B)).toEqual({
      ok: true,
      organizationId: ORG_A,
    })
  })

  it("multiple memberships, no valid pending choice -> select_organization", () => {
    expect(decideTokenOrganization([ORG_A, ORG_B], null)).toEqual({
      ok: false,
      reason: "select_organization",
    })
  })

  it("multiple memberships, pending is a live membership -> bind to the choice", () => {
    expect(decideTokenOrganization([ORG_A, ORG_B], ORG_B)).toEqual({
      ok: true,
      organizationId: ORG_B,
    })
  })

  it("multiple memberships, pending points at a NON-member org -> re-select (forged/stale rejected)", () => {
    expect(decideTokenOrganization([ORG_A, ORG_B], ORG_C)).toEqual({
      ok: false,
      reason: "select_organization",
    })
  })
})
