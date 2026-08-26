/**
 * The invite matrix, asserted as a matrix.
 *
 * One sentence from the spec (§2.10, §5) — *owner invites any role; admin
 * invites admin | member | guest and NEVER owner; member and guest never
 * invite* — with two doors reading it (/admin now, Nastavení › Lidé in PR 22)
 * and a database flooring it. This file pins the TypeScript half so a change to
 * it is a deliberate act with a red test, not a quiet widening.
 */
import { describe, expect, it } from "vitest"

import type { BetaOrgRole, BetaSetupTokenPurpose } from "@/db/schema"

import {
  ADMIN_INVITABLE_ROLES,
  OFFICE_INVITABLE_ROLES,
  invitableRoles,
  mayChangeRole,
  mayGrantRole,
  mayIssuePurpose,
  type InviteIssuer,
} from "./invite-policy"

const ROLES: readonly BetaOrgRole[] = ["owner", "admin", "member", "guest"]
const PURPOSES: readonly BetaSetupTokenPurpose[] = [
  "account_setup",
  "org_invite",
  "password_reset",
]

const office: InviteIssuer = { kind: "office" }
const orgIssuer = (role: BetaOrgRole): InviteIssuer => ({
  kind: "organization",
  role,
})

describe("who may grant which role", () => {
  it("office staff may grant anything", () => {
    expect([...invitableRoles(office)]).toEqual([
      "owner",
      "admin",
      "member",
      "guest",
    ])
    expect([...OFFICE_INVITABLE_ROLES]).toEqual([...ROLES])
  })

  it("an organization owner may grant anything — they ARE office staff", () => {
    // The DB trigger makes `owner` unholdable by a non-staff account, so "owner
    // invites any role" is one office account handing the book to another. The
    // grant still dies at the trigger unless the TARGET is staff too.
    expect([...invitableRoles(orgIssuer("owner"))]).toEqual([
      "owner",
      "admin",
      "member",
      "guest",
    ])
  })

  it("an admin may never grant owner", () => {
    expect([...invitableRoles(orgIssuer("admin"))]).toEqual([
      ...ADMIN_INVITABLE_ROLES,
    ])
    expect(mayGrantRole(orgIssuer("admin"), "owner")).toBe(false)
    for (const role of ["admin", "member", "guest"] as const) {
      expect(mayGrantRole(orgIssuer("admin"), role), role).toBe(true)
    }
  })

  it("a member and a guest never invite at all", () => {
    for (const role of ["member", "guest"] as const) {
      expect(invitableRoles(orgIssuer(role))).toHaveLength(0)
      for (const target of ROLES) {
        expect(mayGrantRole(orgIssuer(role), target), `${role}→${target}`).toBe(
          false,
        )
      }
    }
  })

  it("the whole grid, spelled out", () => {
    const grid = [office, ...ROLES.map(orgIssuer)].map((issuer) =>
      ROLES.map((role) => (mayGrantRole(issuer, role) ? "y" : "-")).join(""),
    )
    expect(grid).toEqual([
      "yyyy", // office
      "yyyy", // owner  (= office staff)
      "-yyy", // admin  — never owner
      "----", // member
      "----", // guest
    ])
  })
})

describe("which purposes may be issued", () => {
  it("office staff may issue all three", () => {
    for (const purpose of PURPOSES) {
      expect(mayIssuePurpose(office, purpose), purpose).toBe(true)
    }
  })

  it("the organization door issues invites and nothing else", () => {
    // A password reset drops every session of the target account, and an
    // org-less account_setup creates an identity no organization owner can see
    // or revoke (migration 0001, SF-5). Both are office-staff acts.
    for (const role of ["owner", "admin"] as const) {
      expect(mayIssuePurpose(orgIssuer(role), "org_invite"), role).toBe(true)
      expect(mayIssuePurpose(orgIssuer(role), "password_reset"), role).toBe(
        false,
      )
      expect(mayIssuePurpose(orgIssuer(role), "account_setup"), role).toBe(
        false,
      )
    }
  })

  it("a member and a guest issue nothing", () => {
    for (const role of ["member", "guest"] as const) {
      for (const purpose of PURPOSES) {
        expect(
          mayIssuePurpose(orgIssuer(role), purpose),
          `${role}/${purpose}`,
        ).toBe(false)
      }
    }
  })
})

describe("role changes", () => {
  const change = (
    issuer: InviteIssuer,
    currentRole: BetaOrgRole,
    nextRole: BetaOrgRole,
    same = false,
  ) =>
    mayChangeRole(issuer, {
      issuerUserId: "u1",
      targetUserId: same ? "u1" : "u2",
      currentRole,
      nextRole,
    })

  it("checks the role being TAKEN AWAY as well as the one being given", () => {
    // Demoting an owner is as consequential as granting one. A matrix that
    // only looked at the destination would let a company admin demote the
    // accountant out of the book they keep.
    expect(change(orgIssuer("admin"), "owner", "guest")).toBe(false)
    expect(change(orgIssuer("admin"), "guest", "member")).toBe(true)
  })

  it("refuses a company admin their own promotion, allows their demotion", () => {
    // Self-demotion is half of "transfer rights" (grant-owner, then
    // self-demote) and the last-owner trigger refuses the one that would empty
    // the organization. Self-promotion has no such floor.
    expect(change(orgIssuer("admin"), "admin", "member", true)).toBe(true)
    expect(change(orgIssuer("admin"), "member", "admin", true)).toBe(false)
  })

  it("lets office staff change their own role — /admin is the break-glass", () => {
    // Staff can already grant owner to any staff account, so refusing them
    // their own promotion buys nothing and breaks "owner ve všech" (§3.5). The
    // floor that still applies is `owner ⇒ is_staff`, in the database.
    expect(change(office, "admin", "owner", true)).toBe(true)
    expect(change(office, "owner", "admin", true)).toBe(true)
  })

  it("never lets an admin reach owner in either direction", () => {
    for (const other of ROLES) {
      expect(change(orgIssuer("admin"), other, "owner"), other).toBe(false)
      expect(change(orgIssuer("admin"), "owner", other), other).toBe(false)
    }
  })
})
