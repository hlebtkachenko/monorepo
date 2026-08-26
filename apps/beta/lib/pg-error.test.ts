/**
 * Reading a PostgreSQL error through Drizzle's wrapper.
 *
 * The classification here decides what the office sees when a guard fires: a
 * sentence they can act on, a "try again", or a 500. Getting it wrong is
 * invisible until the day a trigger actually refuses something, which is
 * exactly the day the message matters — so every arm is pinned.
 */
import { describe, expect, it } from "vitest"

import betaMessages from "../messages/cs.json"

import {
  guardRefusal,
  isCheckViolation,
  isDeadlock,
  isUniqueViolation,
} from "./pg-error"

/** What `postgres` raises, wrapped the way Drizzle wraps it. */
function drizzleError(code: string, message: string, depth = 1): unknown {
  let error: unknown = Object.assign(new Error(message), { code })
  for (let i = 0; i < depth; i++) {
    error = Object.assign(new Error("Failed query"), { cause: error })
  }
  return error
}

describe("reading through the wrapper", () => {
  it("finds the driver error under Drizzle's cause chain", () => {
    // The top-level error carries no `code` of its own, so a naive
    // `error.code === "23514"` is always false and every legitimate refusal
    // escapes as a 500.
    expect(isCheckViolation(drizzleError("23514", "boom"))).toBe(true)
    expect(isCheckViolation(drizzleError("23514", "boom", 3))).toBe(true)
    expect(isUniqueViolation(drizzleError("23505", "dup"))).toBe(true)
    expect(isDeadlock(drizzleError("40P01", "deadlock detected"))).toBe(true)
  })

  it("does not confuse the three classes with each other", () => {
    const deadlock = drizzleError("40P01", "deadlock detected")
    expect(isCheckViolation(deadlock)).toBe(false)
    expect(isUniqueViolation(deadlock)).toBe(false)
    // The important one: a deadlock is NOT a guard refusal. If it classified as
    // one, the retry arm in `writeMembership` would be dead code and the office
    // would be told the database refused something it never evaluated.
    expect(guardRefusal(deadlock)).toBeNull()
  })

  it("gives up rather than hanging on a cyclic cause chain", () => {
    const a: { cause?: unknown } = {}
    const b: { cause?: unknown } = { cause: a }
    a.cause = b
    expect(isCheckViolation(a)).toBe(false)
    expect(isDeadlock(a)).toBe(false)
  })

  it("is not fooled by a non-error, a null, or a code that is not a string", () => {
    for (const value of [
      null,
      undefined,
      "23514",
      23514,
      {},
      { code: 23514 },
    ]) {
      expect(isCheckViolation(value), String(value)).toBe(false)
      expect(guardRefusal(value), String(value)).toBeNull()
    }
  })
})

describe("which guard refused", () => {
  /**
   * The phrases are a real coupling to the migrations, and the lesser evil:
   * Postgres gives a trigger's RAISE one SQLSTATE and no subtype. Each string
   * below is copied from the migration that raises it, and the DB suites assert
   * the same wording — so a reworded exception fails a test rather than
   * silently degrading a message to "something went wrong".
   */
  const cases: [string, ReturnType<typeof guardRefusal>][] = [
    [
      "cannot demote or deactivate the last owner of organization abc",
      "last_owner",
    ],
    ["cannot delete the last owner of organization abc", "last_owner"],
    ["cannot deactivate the last owner of organization abc", "last_owner"],
    [
      "organization_membership.role = owner requires app_user.is_staff (user abc)",
      "owner_requires_staff",
    ],
    [
      "organization_membership.role = owner requires an active account (user abc is deactivated)",
      "owner_requires_active",
    ],
    [
      "cannot clear is_staff while user abc holds an active owner membership",
      "staff_holds_owner",
    ],
    ["user_setup_token abc is an immutable grant", "other"],
  ]

  it.each(cases)("classifies %s", (message, expected) => {
    expect(guardRefusal(drizzleError("23514", message))).toBe(expected)
  })

  it("keeps the staff and the deactivated refusals apart", () => {
    // They need different next actions from whoever reads them: "this is not an
    // office account" versus "this office account is switched off".
    const staff = guardRefusal(
      drizzleError("23514", "role = owner requires app_user.is_staff (user x)"),
    )
    const inactive = guardRefusal(
      drizzleError("23514", "role = owner requires an active account (user x)"),
    )
    expect(staff).not.toBe(inactive)
  })

  it("returns null for anything that is not a check violation", () => {
    expect(guardRefusal(drizzleError("23505", "duplicate key"))).toBeNull()
    expect(
      guardRefusal(drizzleError("22P02", "invalid input syntax")),
    ).toBeNull()
  })
})

describe("the refusals reach the UI as real messages", () => {
  /**
   * Every refusal this module can produce is mapped to a message KEY by the
   * action layer. A key with no catalog entry renders as the key itself, which
   * is how an office user ends up staring at `admin.errorRetry` — so the
   * catalog is asserted here rather than discovered in production.
   */
  it("has a Czech string for every refusal the actions can surface", () => {
    const admin = betaMessages.admin as Record<string, string>
    for (const key of [
      "errorLastOwner",
      "errorOwnerRequiresStaff",
      "errorOwnerRequiresActive",
      "errorStaffHoldsOwner",
      "errorOrganizationArchived",
      "errorRetry",
      "errorRejected",
    ]) {
      expect(admin[key], key).toBeTruthy()
    }

    // The consume path has its own catalog namespace and its own retry copy —
    // it must say "the link was NOT used", which the /admin wording does not.
    const auth = betaMessages.auth as Record<string, string>
    expect(auth["retryLater"]).toBeTruthy()
  })
})
