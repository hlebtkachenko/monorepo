import "server-only"

import { notFound } from "next/navigation"
import { and, eq, isNull } from "drizzle-orm"

import { betaDb } from "@/db/client"
import {
  app_user,
  organization,
  organization_membership,
  type BetaOrgRole,
} from "@/db/schema"
import { getBetaSession } from "@/lib/auth/session"

import { isValidOrgSlugFormat } from "./org-slug"

/**
 * The tenancy seam — the inner wall.
 *
 * The outer wall is the database itself: beta owns its RDS instance and shares
 * no table with the main product (plan Part 1). Inside that database every
 * organization lives in the same tables with no RLS (plan Part 4), so what keeps
 * one client's book out of another's page is THIS module and nothing else.
 *
 * TWO DOORS, AND NO THIRD ONE. `requireScope` (an organization) and
 * `requireOffice` (the cross-org office area) are the only functions that
 * produce a scope handle. The brand symbols are module-private, so no other
 * file — not a route, not a test, not a future data module — can build one by
 * hand: an object literal shaped like `OrgScope` is a type error, because the
 * symbol key it would need is not in scope anywhere else. A data function that
 * takes `OrgScope` is therefore provably reachable only through a resolved
 * membership.
 *
 * WHY EVERY REFUSAL IS 404. Unknown slug, no session, no membership, an
 * inactive membership, a deactivated user, an archived organization — all six
 * end in `notFound()`. A 403 would answer a question the caller is not entitled
 * to ask: it distinguishes "this organization does not exist" from "it exists
 * and you are not in it", which is a membership oracle over a URL space of
 * guessable company slugs. The client of an accounting office should not be
 * able to enumerate the office's other clients.
 *
 * (The friendly redirect for a signed-out visitor still happens, one level up:
 * `app/(portal)/layout.tsx` calls `requireBetaSession()`, which redirects to
 * /sign-in before any page body runs. The 404 here is the floor underneath it,
 * for the case where a route is ever mounted outside that layout.)
 *
 * ONE QUERY, ALL SIX CONDITIONS. The resolution is a single statement joining
 * membership → organization → user. Splitting it into "find the org, then check
 * the membership" is what produces the classic leak: the first query's failure
 * mode differs from the second's, and the difference is observable in timing
 * and in code paths. Here there is one row or no row.
 *
 * NARROWING LATER (spec §2.6.1, PR 32). The employee seat is a `guest`
 * membership linked to a `payroll_employee` row, and it sees only its own
 * payroll. That is a NARROWING of this handle, not a new one: it arrives as one
 * more LEFT JOIN in `resolveOrgScope` and one more readonly field on `OrgScope`,
 * which `payrollScope()` then reads. Nothing that consumes a scope today has to
 * change for that to land — which is why the handle carries resolved facts
 * rather than a role string callers re-interpret.
 */

const orgScopeBrand = Symbol("beta.OrgScope")
const officeScopeBrand = Symbol("beta.OfficeScope")

/**
 * Proof that a specific user holds a specific active membership in a specific
 * live organization. Every organization-scoped query takes one of these and
 * filters on `organizationId`.
 */
export type OrgScope = {
  readonly [orgScopeBrand]: true
  readonly organizationId: string
  /** The canonical slug as stored, not as typed into the URL. */
  readonly organizationSlug: string
  readonly userId: string
  readonly role: BetaOrgRole
  /**
   * Office staff (`app_user.is_staff`). Recorded because an owner membership
   * is only ever held by staff and some office-internal surfaces inside an
   * organization key off it — never serialized to a client (`projections.ts`).
   */
  readonly isStaff: boolean
}

/**
 * Proof that the caller is office staff. The cross-org /admin area (PR 08)
 * cannot be gated by an organization role — it is above organizations — so it
 * gets its own door (Advisor blocker B4-6, there named
 * `requireAccountantGlobal`).
 */
export type OfficeScope = {
  readonly [officeScopeBrand]: true
  readonly userId: string
  readonly isStaff: true
}

/**
 * Resolve the signed-in user's scope in `orgSlug`, or answer 404.
 *
 * Refuses identically for: no session, malformed slug, unknown organization,
 * archived organization, no membership, inactive membership, deactivated user.
 */
export async function requireScope(orgSlug: string): Promise<OrgScope> {
  const session = await getBetaSession()
  if (!session) notFound()

  // A slug that cannot exist is answered without a round trip. The DB CHECK
  // means a non-matching string can never be stored, so this is a shortcut and
  // not a second, weaker validation. The rule itself lives in `org-slug.ts`,
  // shared with the /admin create form so the two cannot disagree about what a
  // slug is.
  if (!isValidOrgSlugFormat(orgSlug)) notFound()

  const [row] = await betaDb()
    .select({
      organizationId: organization.id,
      organizationSlug: organization.slug,
      role: organization_membership.role,
      isStaff: app_user.is_staff,
    })
    .from(organization_membership)
    .innerJoin(
      organization,
      eq(organization.id, organization_membership.organization_id),
    )
    .innerJoin(app_user, eq(app_user.id, organization_membership.user_id))
    .where(
      and(
        eq(organization.slug, orgSlug),
        eq(organization_membership.user_id, session.userId),
        // Membership rows are the ONLY visibility mechanism. There is no staff
        // bypass: an accountant without a membership in this organization gets
        // the same 404 as a stranger (Advisor Part 4 — an implicit bypass
        // multiplies the offboarding surface). /admin grants the memberships.
        eq(organization_membership.active, true),
        isNull(organization.archived_at),
        // Redundant with `getBetaSession`, which drops a session whose user has
        // been deactivated. Kept because this seam must be fail-closed on its
        // own terms: it costs nothing in a join that is already happening, and
        // it means a future caller that resolves a session differently cannot
        // re-open a deactivated account's access.
        isNull(app_user.disabled_at),
      ),
    )
    .limit(1)

  if (!row) notFound()

  const scope: OrgScope = {
    [orgScopeBrand]: true,
    organizationId: row.organizationId,
    organizationSlug: row.organizationSlug,
    userId: session.userId,
    role: row.role,
    isStaff: row.isStaff,
  }
  return Object.freeze(scope)
}

/** Resolve the signed-in user as office staff, or answer 404. */
export async function requireOffice(): Promise<OfficeScope> {
  const session = await getBetaSession()
  if (!session) notFound()

  const [row] = await betaDb()
    .select({ isStaff: app_user.is_staff })
    .from(app_user)
    .where(and(eq(app_user.id, session.userId), isNull(app_user.disabled_at)))
    .limit(1)

  if (!row?.isStaff) notFound()

  const office: OfficeScope = {
    [officeScopeBrand]: true,
    userId: session.userId,
    isStaff: true,
  }
  return Object.freeze(office)
}

/**
 * Owner-only surfaces inside an organization: Pro účetní, the internal layer,
 * and every accounting write (spec §5). owner IS the accountant in the final
 * role model, so this is the Advisor's `assertAccountant` under the name the
 * role model actually uses.
 *
 * It answers 404 rather than 403 for the same reason `requireScope` does — a
 * 403 on /ucetni would confirm the section exists for someone. The write layer
 * that lands later may still answer 403 on a POST, where the caller already
 * knows the surface exists because it rendered for them.
 */
export function assertOwner(scope: OrgScope): void {
  if (scope.role !== "owner") notFound()
}
