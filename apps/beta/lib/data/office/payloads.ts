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
 * The tombstone address an anonymized account keeps forever.
 *
 * DERIVED FROM THE ROW'S OWN PRIMARY KEY, which buys three properties at once
 * and no others: it is UNIQUE without a lookup (the id already is), it carries
 * NO trace of the person (a hash of the old address would still be a
 * pseudonym — reversible by anyone holding a guess and a hash function), and
 * re-anonymizing an already-anonymized row produces the SAME address rather
 * than a unique-violation against itself.
 *
 * `.invalid` is the RFC 2606 reserved TLD: it is guaranteed never to resolve,
 * so nothing this deployment does can ever deliver mail to a tombstone by
 * accident.
 */
export function anonymizedEmail(userId: string): string {
  return `anonymized-${userId}@anonymized.invalid`
}

/**
 * The shape `anonymizedEmail` mints, as a pattern — the reserved namespace no
 * operator-supplied address may enter.
 *
 * WHY REFUSING THESE MATTERS. `app_user.email` is UNIQUE, so an account already
 * sitting on `anonymized-<victim id>@anonymized.invalid` makes that victim's
 * erasure fail on a unique violation. A GDPR Art. 17 request that cannot be
 * executed — reported as "the database refused it" — is exactly the outcome the
 * anonymization path exists to guarantee against, and office staff choose the
 * addresses they provision.
 *
 * The WHOLE shape rather than just the domain: `.invalid` is a reserved TLD that
 * nothing can deliver to, so there is no reason to forbid it generally, and a
 * narrow rule is one an operator can read off the tombstone it protects. The
 * database floors the same rule per-row (`app_user_tombstone_guard`, migration
 * 0021), which is what makes it hold for write paths that never call this.
 */
const ANONYMIZED_EMAIL_PATTERN =
  /^anonymized-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@anonymized\.invalid$/i

export function isReservedAnonymizedEmail(email: string): boolean {
  return ANONYMIZED_EMAIL_PATTERN.test(email.trim())
}

/**
 * Erase the person, keep the row (migration 0021).
 *
 * WHY THIS IS AN UPDATE AND NOT A DELETE. `activity_log.actor_user_id` is
 * `ON DELETE RESTRICT` and NOT NULL for both actor kinds, so an account that has
 * ever acted in a book cannot be removed — deliberately. Czech accounting
 * retention obliges the office to keep the record of who booked what; GDPR
 * Art. 17(3)(b) is the carve-out that makes keeping it lawful. What erasure can
 * take is the IDENTITY, and this payload is the exact list of what that means:
 *
 *   email                 → the tombstone above. Also the login handle, so
 *                           rewriting it is itself a revocation.
 *   name, image           → the two profile fields a person's row carries.
 *   email_verified        → an assertion about an address that no longer exists.
 *   two_factor_enabled    → the flag; `two_factor` (secret + backup codes) is
 *                           deleted outright by the caller.
 *   is_staff              → an anonymized account is nobody, and nobody is
 *                           office staff. Floored by `beta_app_user_owner_guard`
 *                           if the account still holds an active owner
 *                           membership, which is why the caller deactivates
 *                           memberships first.
 *   disabled_at           → set unconditionally, and NOT read from the caller.
 *                           A re-anonymization must not move the timestamp of
 *                           the original offboarding, so the caller passes the
 *                           value it already read.
 *
 * WHAT IS DELIBERATELY NOT HERE. `locale` (a rendering preference, not a
 * person), `created_at` (when the row appeared, which the retention obligation
 * is about), and `id` (the thing every audit row points at). Erasing any of
 * those would break the record without protecting anybody.
 */
export function anonymizedUserPayload(
  userId: string,
  disabledAt: Date,
): {
  email: string
  name: string
  image: null
  email_verified: false
  two_factor_enabled: false
  is_staff: false
  disabled_at: Date
} {
  return {
    email: anonymizedEmail(userId),
    // Empty rather than a fake name: every people grid in the app renders
    // `name` verbatim, and "Anonymizovaný uživatel" in a Czech grid is a
    // sentence the office would have to translate back into "this row is a
    // tombstone" every time it read one.
    name: "",
    image: null,
    email_verified: false,
    two_factor_enabled: false,
    is_staff: false,
    disabled_at: disabledAt,
  }
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
