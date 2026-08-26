import type { BetaVatRegime } from "@/db/schema"

/**
 * Audited payload builders for the privileged `app_user` columns.
 *
 * `is_staff` gates /admin and is the database precondition for an `owner`
 * membership; `disabled_at` is the offboarding switch. Both are set HERE and
 * nowhere else (spec §3.5: "is_staff set here only"), and
 * `lib/auth/app-user-writes.boundary.test.ts` enforces that: it walks the real
 * TypeScript AST of every production module in this app and fails on any
 * `insert(app_user).values(...)` / `update(app_user).set(...)` whose payload is
 * an object literal naming a privileged column, a spread, or a call to anything
 * other than one of the builders named in its allowlist.
 *
 * WHAT A BUILDER GUARANTEES, AND WHAT IT DOES NOT. It guarantees the SHAPE: the
 * returned object names its columns literally, so nothing else can ride along
 * in an object that happened to arrive from a form. It does not guarantee the
 * AUTHORITY — that is `requireOffice()` in the Server Action, re-checked on
 * every call, plus the database triggers underneath. The two are separate
 * questions and the split is on purpose: a builder that also asked "may you?"
 * would need a scope, and a builder with a scope is a data function wearing a
 * disguise.
 *
 * Primitive parameters rather than an options object, for the same reason: a
 * `boolean` cannot smuggle a second column.
 *
 * PURE MODULE — no database, no `server-only`.
 */

/**
 * A new office-provisioned identity. Three columns and no fourth: the account
 * has no credential yet (the `account_setup` link creates that), no
 * `email_verified` assertion, and no `disabled_at`.
 *
 * `email` is normalized here as well as by the DB trigger, so what the caller
 * gets back from a `RETURNING` matches what it thinks it wrote.
 */
export function officeUserPayload(input: {
  email: string
  name: string
  isStaff: boolean
}): { email: string; name: string; is_staff: boolean } {
  return {
    email: input.email.trim().toLowerCase(),
    name: input.name.trim(),
    is_staff: input.isStaff,
  }
}

/** Grant or revoke office staff. Revocation is floored by the DB trigger. */
export function staffFlagPayload(isStaff: boolean): { is_staff: boolean } {
  return { is_staff: isStaff }
}

/**
 * Deactivate or reactivate an account.
 *
 * Deactivation is a soft delete: the row and its documents stay, because a
 * leaver still needs their last payslip (spec §2.6.1). The timestamp is taken
 * server-side; a caller-supplied one would be a way to backdate an offboarding.
 */
export function accountDisabledPayload(disabled: boolean): {
  disabled_at: Date | null
} {
  return { disabled_at: disabled ? new Date() : null }
}

/**
 * The organization flags /admin owns (spec §3.5: "create/archive, vat_regime,
 * is_demo"). Not privileged in the `app_user` sense — no boundary test covers
 * `organization` writes — but built the same way so the /admin write surface
 * reads as one thing.
 *
 * `vat_registered_from` travels WITH the regime: setting `platce` without a
 * date, or leaving a stale date behind after a switch to `neplatce`, is what
 * makes the identity card lie. A `neplatce` clears it.
 */
export function organizationVatPayload(
  regime: BetaVatRegime,
  registeredFrom: string | null,
): { vat_regime: BetaVatRegime; vat_registered_from: string | null } {
  return {
    vat_regime: regime,
    vat_registered_from: regime === "platce" ? registeredFrom : null,
  }
}
