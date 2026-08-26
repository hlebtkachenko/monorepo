import { describe, expect, it } from "vitest"

import { rootRoutingDecision } from "./root-routing"

describe("rootRoutingDecision", () => {
  it("redirects straight into the org on exactly one active membership", () => {
    expect(
      rootRoutingDecision({
        membershipCount: 1,
        firstSlug: "acme-sro",
        isStaff: false,
      }),
    ).toEqual({ kind: "redirect", slug: "acme-sro" })
  })

  it("shows the picker for two or more", () => {
    for (const membershipCount of [2, 3, 7]) {
      expect(
        rootRoutingDecision({
          membershipCount,
          firstSlug: "acme-sro",
          isStaff: false,
        }),
      ).toEqual({ kind: "picker" })
    }
  })

  it("shows the plain empty state for zero memberships and no staff flag", () => {
    expect(
      rootRoutingDecision({
        membershipCount: 0,
        firstSlug: undefined,
        isStaff: false,
      }),
    ).toEqual({ kind: "empty", staffLink: false })
  })

  it("shows the empty state WITH the /admin link for staff with zero memberships", () => {
    expect(
      rootRoutingDecision({
        membershipCount: 0,
        firstSlug: undefined,
        isStaff: true,
      }),
    ).toEqual({ kind: "empty", staffLink: true })
  })

  it("never redirects on a missing slug even if the count claims one", () => {
    // Defensive: a caller passing an inconsistent count/slug pair (a bug
    // upstream) must not produce a redirect to `/undefined`.
    expect(
      rootRoutingDecision({
        membershipCount: 1,
        firstSlug: undefined,
        isStaff: false,
      }),
    ).toEqual({ kind: "empty", staffLink: false })
  })
})
