/**
 * The forced-TOTP routing matrix (spec §2.0.1 / §2.10), exhausted — in BOTH
 * states of the `BETA_TOTP_REQUIRED` switch.
 *
 * Three booleans, eight cases, all of them named; times two for the gate, which
 * collapses the whole table to `false`. Env is injected as a parameter rather
 * than stubbed on `process.env`, because the module is pure and the test should
 * stay so.
 */
import { describe, expect, it } from "vitest"

import {
  requiresTotpEnrolment,
  TOTP_ENROLMENT_PATH,
  totpEnforcementEnabled,
  totpMandatoryFor,
  type TotpSubject,
} from "./totp-enforcement"

/** The mandate switched on — every case below that expects it names this. */
const ON = { BETA_TOTP_REQUIRED: "true" }

const subject = (overrides: Partial<TotpSubject> = {}): TotpSubject => ({
  isStaff: false,
  hasOwnerMembership: false,
  twoFactorEnabled: false,
  ...overrides,
})

describe("totpEnforcementEnabled — the switch", () => {
  it("is off when unset, which is the deployed state", () => {
    expect(totpEnforcementEnabled({})).toBe(false)
    expect(totpEnforcementEnabled({ BETA_TOTP_REQUIRED: undefined })).toBe(
      false,
    )
  })

  it("is on for exactly `true`, and for nothing else", () => {
    expect(totpEnforcementEnabled(ON)).toBe(true)
    // Trimmed, because an env file written by hand carries whitespace.
    expect(totpEnforcementEnabled({ BETA_TOTP_REQUIRED: " true " })).toBe(true)
    // A fuzzy truthiness check is how a gate ends up open on "false".
    for (const value of ["1", "yes", "on", "TRUE", "True", "false", ""]) {
      expect(totpEnforcementEnabled({ BETA_TOTP_REQUIRED: value }), value).toBe(
        false,
      )
    }
  })
})

describe("the mandate is off unless the switch is on", () => {
  it("forces nobody to enrol while `BETA_TOTP_REQUIRED` is unset", () => {
    // The case the switch exists for: the office's own accounts sign in with a
    // password alone and no redirect stands between them and the portal.
    expect(
      requiresTotpEnrolment(
        subject({ isStaff: true, hasOwnerMembership: true }),
        {},
      ),
    ).toBe(false)
    expect(requiresTotpEnrolment(subject({ isStaff: true }), {})).toBe(false)
    expect(
      requiresTotpEnrolment(subject({ hasOwnerMembership: true }), {}),
    ).toBe(false)
  })

  it("claims no obligation in Nastavení either", () => {
    // `totpMandatory` drives a notice that says the account MUST keep 2FA on.
    // With nothing enforcing it, that notice would be a fiction.
    const office = subject({ isStaff: true, hasOwnerMembership: true })
    expect(totpMandatoryFor(office, {})).toBe(false)
    expect(totpMandatoryFor(office, ON)).toBe(true)
  })

  it("is exhaustive with the switch off: all eight cases are `false`", () => {
    for (const isStaff of [false, true]) {
      for (const hasOwnerMembership of [false, true]) {
        for (const twoFactorEnabled of [false, true]) {
          const input = { isStaff, hasOwnerMembership, twoFactorEnabled }
          expect(requiresTotpEnrolment(input, {}), JSON.stringify(input)).toBe(
            false,
          )
        }
      }
    }
  })
})

describe("requiresTotpEnrolment — who is under the mandate, switch ON", () => {
  it("blocks an owner who has not enrolled", () => {
    // Spec §2.10: "2FA (forced for owner)". This is the case the rule exists for.
    expect(
      requiresTotpEnrolment(
        subject({ hasOwnerMembership: true, isStaff: true }),
        ON,
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
        ON,
      ),
    ).toBe(false)
  })

  it("blocks office staff even without an owner membership anywhere", () => {
    // The gap keying on the membership alone would leave: `is_staff` is what
    // opens /admin, which can mint memberships into every client book.
    expect(requiresTotpEnrolment(subject({ isStaff: true }), ON)).toBe(true)
  })

  it("blocks an owner membership held by a non-staff account", () => {
    // A DB trigger makes this unreachable today
    // (`organization_membership_owner_requires_staff`). The predicate covers it
    // anyway: the rule must not depend on a trigger elsewhere staying in place.
    expect(
      requiresTotpEnrolment(subject({ hasOwnerMembership: true }), ON),
    ).toBe(true)
  })

  it("leaves every client-side role alone", () => {
    // admin (Majitel společnosti), member (Pracovník firmy), guest (Host / the
    // employee seat) are the client's own people. Forcing an authenticator app
    // on a site foreman is how a shared login gets created.
    expect(requiresTotpEnrolment(subject(), ON)).toBe(false)
    expect(requiresTotpEnrolment(subject({ twoFactorEnabled: true }), ON)).toBe(
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
      expect(
        requiresTotpEnrolment(row.input, ON),
        JSON.stringify(row.input),
      ).toBe(row.expected)
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
