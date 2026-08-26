/**
 * Who is REQUIRED to hold a second factor, and where a request goes when they
 * do not (spec §2.0.1 "owner: setup link → password → forced TOTP → `/`",
 * §2.10 "Účet: 2FA (forced for owner)").
 *
 * PURE MODULE — no database, no `server-only`, no Better Auth. It takes the
 * three booleans the decision depends on rather than a session object, so the
 * rule itself is a total function that a test can exhaust in nine lines instead
 * of a fixture with a real TOTP enrolment behind it. The reading side lives in
 * `lib/data/account.ts`; the redirect lives in the two layouts that call it.
 *
 * WHY `isStaff` IS IN THE PREDICATE AND NOT JUST `owner`. The spec names the
 * owner, and in the role model an owner membership is only ever held by office
 * staff — the DB trigger `organization_membership_owner_requires_staff` makes
 * "owner" a strict subset of "staff". Keying on the membership alone therefore
 * leaves exactly one gap, and it is the worst one available: a staff account
 * with no owner membership anywhere still opens /admin, which is the cross-org
 * surface that can mint memberships into every client book. Enforcing on
 * `isStaff || hasOwnerMembership` closes that gap without widening the rule to
 * anyone the spec meant to leave alone — every account it newly covers is an
 * office account, which is the population the spec is about ("office TOTP",
 * plan Part 4).
 *
 * WHO IS UNAFFECTED, and stays unaffected: `admin` (Majitel společnosti),
 * `member` (Pracovník firmy) and `guest` (Host / the employee seat). They are
 * the client's own people on a portal that shows them their own accountant's
 * output; forcing an authenticator app on a site foreman is how a shared login
 * gets created. They may still enrol voluntarily from Nastavení › Účet.
 */

export type TotpSubject = {
  /** `app_user.is_staff` — office staff, the /admin precondition. */
  readonly isStaff: boolean
  /** At least one ACTIVE `owner` membership in a live organization. */
  readonly hasOwnerMembership: boolean
  /** `app_user.two_factor_enabled`, written only by Better Auth's plugin. */
  readonly twoFactorEnabled: boolean
}

/** True when this account may not use the portal until it enrols. */
export function requiresTotpEnrolment(subject: TotpSubject): boolean {
  if (subject.twoFactorEnabled) return false
  return subject.isStaff || subject.hasOwnerMembership
}

/**
 * The blocking screen. A route, not a modal: a modal is dismissible by
 * definition (Escape, a stray click, devtools) and "forced" has to survive
 * every one of those. It lives in the `(auth)` group, which draws no rail, no
 * org switcher and no nav — so there is nothing on the page to escape through
 * except finishing enrolment or signing out.
 */
export const TOTP_ENROLMENT_PATH = "/zabezpeceni"
