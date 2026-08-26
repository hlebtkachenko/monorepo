/**
 * The forced-TOTP routing matrix (spec §2.0.1 / §2.10), exhausted.
 *
 * Three booleans, eight cases, all of them named — the predicate is the whole
 * rule, so there is no useful subset to test.
 */
import { describe, expect, it } from "vitest"

import {
  requiresTotpEnrolment,
  TOTP_ENROLMENT_PATH,
  type TotpSubject,
} from "./totp-enforcement"

const subject = (overrides: Partial<TotpSubject> = {}): TotpSubject => ({
  isStaff: false,
  hasOwnerMembership: false,
  twoFactorEnabled: false,
  ...overrides,
})

describe("requiresTotpEnrolment — who is under the mandate", () => {
  it("blocks an owner who has not enrolled", () => {
    // Spec §2.10: "2FA (forced for owner)". This is the case the rule exists for.
    expect(
      requiresTotpEnrolment(
        subject({ hasOwnerMembership: true, isStaff: true }),
      ),
    ).toBe(true)
  })

  it("lets an owner who HAS enrolled through", () => {
    expect(
      requiresTotpEnrolment(
        subject({
          hasOwnerMembership: true,
          isStaff: true,
          twoFactorEnabled: true,
        }),
      ),
    ).toBe(false)
  })

  it("blocks office staff even without an owner membership anywhere", () => {
    // The gap keying on the membership alone would leave: `is_staff` is what
    // opens /admin, which can mint memberships into every client book.
    expect(requiresTotpEnrolment(subject({ isStaff: true }))).toBe(true)
  })

  it("blocks an owner membership held by a non-staff account", () => {
    // A DB trigger makes this unreachable today
    // (`organization_membership_owner_requires_staff`). The predicate covers it
    // anyway: the rule must not depend on a trigger elsewhere staying in place.
    expect(requiresTotpEnrolment(subject({ hasOwnerMembership: true }))).toBe(
      true,
    )
  })

  it("leaves every client-side role alone", () => {
    // admin (Majitel společnosti), member (Pracovník firmy), guest (Host / the
    // employee seat) are the client's own people. Forcing an authenticator app
    // on a site foreman is how a shared login gets created.
    expect(requiresTotpEnrolment(subject())).toBe(false)
    expect(requiresTotpEnrolment(subject({ twoFactorEnabled: true }))).toBe(
      false,
    )
  })

  it("is exhaustive: enrolment always wins, otherwise office-ness decides", () => {
    const table: { input: TotpSubject; expected: boolean }[] = []
    for (const isStaff of [false, true]) {
      for (const hasOwnerMembership of [false, true]) {
        for (const twoFactorEnabled of [false, true]) {
          table.push({
            input: { isStaff, hasOwnerMembership, twoFactorEnabled },
            expected: !twoFactorEnabled && (isStaff || hasOwnerMembership),
          })
        }
      }
    }
    expect(table).toHaveLength(8)
    for (const row of table) {
      expect(requiresTotpEnrolment(row.input), JSON.stringify(row.input)).toBe(
        row.expected,
      )
    }
  })
})

describe("the enrolment route", () => {
  it("is outside every gated group", () => {
    // The gate lives in `app/(portal)/layout.tsx` and `app/admin/layout.tsx`;
    // the screen must not be under either, or complying with the mandate would
    // require having already complied with it.
    expect(TOTP_ENROLMENT_PATH).toBe("/zabezpeceni")
    expect(TOTP_ENROLMENT_PATH.startsWith("/admin")).toBe(false)
  })
})
