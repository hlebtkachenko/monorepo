import type { BetaOrgRole, BetaSetupTokenPurpose } from "@/db/schema"

/**
 * WHO MAY HAND OUT WHICH LINK — the server-side half of the invite matrix.
 *
 * The rule this module encodes is one sentence from the structure spec (§2.10,
 * §5): *owner invites any role; admin invites admin | member | guest and NEVER
 * owner; member and guest never invite at all.* It is written here as data
 * rather than as an `if` inside a Server Action because it has TWO callers with
 * two different doors:
 *
 *   - /admin (PR 08) — the office, gated by `requireOffice()`;
 *   - Nastavení › Lidé (PR 22) — the organization, gated by `requireScope()`.
 *
 * One of them shipping a subtly different matrix is exactly how a company admin
 * ends up able to mint an owner. So the matrix lives once, both doors read it,
 * and the database floors it independently: `beta_setup_token_issuer_guard`
 * (0000/0001) refuses an owner grant or a password reset from a non-staff
 * issuer and refuses any org-scoped issuance from someone without an active
 * owner|admin membership in that very organization, and
 * `beta_membership_owner_requires_staff` refuses an owner membership for a
 * non-staff account whatever the link said.
 *
 * THIS MODULE IS PURE. No database, no `server-only`, no request. It takes the
 * facts a resolved scope already carries and answers yes or no, so it can be
 * asserted directly and cannot drift into doing I/O.
 *
 * WHY `owner` CAN INVITE AN OWNER AND IT IS NOT AN ESCALATION. An `owner`
 * membership is only ever held by office staff — the DB trigger makes that
 * unconditional — so "an org owner grants owner" is one office account handing
 * the book to another, and the grant still dies at the trigger unless the
 * TARGET is staff too. A company `admin` is never staff, which is why the same
 * sentence reads as a hard refusal for them.
 */

/**
 * The issuer as the calling door already knows them. `office` is a resolved
 * `OfficeScope` (is_staff proven); `organization` is a resolved `OrgScope`
 * (membership proven, role resolved). No third shape: an issuer that arrived
 * some other way has not been authenticated.
 */
export type InviteIssuer =
  | { readonly kind: "office" }
  | { readonly kind: "organization"; readonly role: BetaOrgRole }

/** Office staff may grant anything, including owner. */
export const OFFICE_INVITABLE_ROLES: readonly BetaOrgRole[] = Object.freeze([
  "owner",
  "admin",
  "member",
  "guest",
])

/**
 * A company admin's ceiling. `owner` is absent and must stay absent: it is the
 * accountant seat, the internal layer and every accounting write (§5).
 */
export const ADMIN_INVITABLE_ROLES: readonly BetaOrgRole[] = Object.freeze([
  "admin",
  "member",
  "guest",
])

const NO_ROLES: readonly BetaOrgRole[] = Object.freeze([])

/** Which roles this issuer may put on an invite. Empty means "cannot invite". */
export function invitableRoles(issuer: InviteIssuer): readonly BetaOrgRole[] {
  if (issuer.kind === "office") return OFFICE_INVITABLE_ROLES
  // An org owner IS office staff (DB trigger), so "owner invites any role" is
  // the same permission as the office's, reached through the organization door.
  if (issuer.role === "owner") return OFFICE_INVITABLE_ROLES
  if (issuer.role === "admin") return ADMIN_INVITABLE_ROLES
  return NO_ROLES
}

export function mayGrantRole(issuer: InviteIssuer, role: BetaOrgRole): boolean {
  return invitableRoles(issuer).includes(role)
}

/**
 * Which link purposes this issuer may mint.
 *
 * `password_reset` and an org-less `account_setup` are office-staff acts and
 * nothing else: a reset drops every session of the target account, and an
 * org-less account_setup creates a portal identity no organization owner can
 * see or revoke (migration 0001, SF-5). The organization door issues invites
 * into its own book, full stop.
 */
export function mayIssuePurpose(
  issuer: InviteIssuer,
  purpose: BetaSetupTokenPurpose,
): boolean {
  if (issuer.kind === "office") return true
  return purpose === "org_invite" && invitableRoles(issuer).length > 0
}

/**
 * The role-change ceiling.
 *
 * It is the invite ceiling applied TWICE — to the role being taken away as well
 * as to the role being given. Demoting an owner is as consequential as granting
 * one, and a matrix that only checked the destination would let a company admin
 * demote the accountant out of the book they keep.
 *
 * Plus one asymmetry, and only on the organization door: a company admin may
 * not change their OWN role upward. Self-DEMOTION stays legal there because it
 * is half of the documented "transfer rights" primitive (plan Part 4:
 * grant-owner, then self-demote) and the last-owner trigger refuses the
 * demotion that would empty the organization. Self-PROMOTION has no such floor
 * above `owner ⇒ is_staff`, so it is refused outright.
 *
 * Office staff are exempt from that asymmetry, deliberately. /admin IS the
 * break-glass: staff can already grant owner to any staff account, so refusing
 * them their own promotion would buy nothing and would break the one-click
 * "owner ve všech" the spec asks for (§3.5). The floor that still applies to
 * them is the one that matters — `owner ⇒ is_staff`, in the database.
 */
export function mayChangeRole(
  issuer: InviteIssuer,
  input: {
    readonly issuerUserId: string
    readonly targetUserId: string
    readonly currentRole: BetaOrgRole
    readonly nextRole: BetaOrgRole
  },
): boolean {
  const allowed = invitableRoles(issuer)
  if (!allowed.includes(input.currentRole)) return false
  if (!allowed.includes(input.nextRole)) return false
  if (
    issuer.kind === "organization" &&
    input.issuerUserId === input.targetUserId
  ) {
    return isDemotion(input.currentRole, input.nextRole)
  }
  return true
}

/** owner > admin > member > guest, for the self-demotion test only. */
const ROLE_RANK: Record<BetaOrgRole, number> = {
  owner: 3,
  admin: 2,
  member: 1,
  guest: 0,
}

function isDemotion(current: BetaOrgRole, next: BetaOrgRole): boolean {
  return ROLE_RANK[next] < ROLE_RANK[current]
}
