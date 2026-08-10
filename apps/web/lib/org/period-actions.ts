"use server"

import { cookies, headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { auth } from "@workspace/auth/server"
import { withOrganization } from "@workspace/db"
import { accounting_period } from "@workspace/db/schema"
import {
  closePeriod,
  openPeriod,
  reopenPeriod,
  PeriodCloseBlockedError,
  PeriodReopenBlockedError,
} from "@workspace/accounting"
import type {
  ClosePeriodResult,
  FxRateKind,
  PeriodCloseReadiness,
  ReopenPeriodResult,
} from "@workspace/accounting"

import { orgHref } from "./href"
import { PERIOD_COOKIE } from "./period"
import { resolveMembership } from "./resolve"
import { getRequestSession } from "./session"

/** Max length of a user-entered period code — a short label, not free text. */
const ZKRATKA_MAX = 32

/** The Účetní období route revalidated after any period write. */
const PERIODS_ROUTE = "closing/periods"

// Boundary validation: a uuid shape for the period id so an arbitrary string
// can't be stored in the year-long cookie. The READ side is the real tenant
// boundary — `getActivePeriod` only honors an id that belongs to the org's
// periods — so this writer just needs a signed-in caller; a bogus or cross-org
// id is inert.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Persist the active period as the signed-in user's sticky default.
 *
 * The rebuilt period switch drives the active period through the URL
 * (`router.push(orgHref(slug, path, { period }))`), which re-renders the layout
 * and pages — the navigation IS the switch. This action only writes the cookie
 * so the choice survives a plain navigation with no `?period=` and the next
 * visit; it is best-effort persistence, never the authoritative selection.
 */
export async function setPeriodDefault(
  periodId: string,
): Promise<{ ok: boolean }> {
  if (!UUID_RE.test(periodId)) return { ok: false }

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return { ok: false }

  const cookieStore = await cookies()
  cookieStore.set(PERIOD_COOKIE, periodId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  })
  return { ok: true }
}

/**
 * Set the editable short code (zkratka) of one accounting period.
 *
 * Tenancy is derived server-side like `listFavorites`/`toggleFavorite`: `userId`
 * from the session, `organizationId` from `resolveMembership({ slug, userId })`
 * (only an org the caller belongs to resolves). The write runs under
 * `withOrganization`, so the `accounting_period` FORCE-RLS policy is the tenant
 * boundary; the explicit `organization_id` filter is defense-in-depth and the
 * `id` filter targets the one row. `slug` is a routing key, never a tenant id.
 * Revalidates the Periods list so the stored value replaces the derived default.
 */
export async function updatePeriodZkratka(input: {
  slug: string
  periodId: string
  zkratka: string
}): Promise<{ ok: boolean }> {
  if (!UUID_RE.test(input.periodId)) return { ok: false }
  const zkratka = input.zkratka.trim()
  if (!zkratka || zkratka.length > ZKRATKA_MAX) return { ok: false }

  const session = await getRequestSession()
  const userId = session?.user?.id
  if (!userId) return { ok: false }

  const membership = await resolveMembership({ slug: input.slug, userId })
  if (!membership) return { ok: false }
  const { organizationId } = membership

  await withOrganization(organizationId, userId, async (db) => {
    await db
      .update(accounting_period)
      .set({ zkratka })
      .where(
        and(
          eq(accounting_period.id, input.periodId),
          eq(accounting_period.organization_id, organizationId),
        ),
      )
  })

  revalidatePath(orgHref(input.slug, PERIODS_ROUTE))
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Period lifecycle (§17, ČÚS 002) — open / close / reopen. Each wires the
// already-shipped @workspace/accounting domain to the /o edge. Tenancy is
// derived server-side exactly like updatePeriodZkratka: `userId` from the
// session, `organizationId` + `workspaceId` from resolveMembership({ slug,
// userId }) (only an org the caller belongs to resolves). The write runs under
// `withOrganization`, so FORCE RLS is the tenant boundary; `slug` is a routing
// key, never a tenant id. NEVER accept organization_id / user_id / workspace_id
// / role / reopenedBy / responsibleUserId as input — all are injected here.
// ---------------------------------------------------------------------------

type OpenPeriodActionResult =
  | { ok: true; newPeriodId: string }
  | { ok: false; forbidden: true }
  | { ok: false; error?: string }

type ClosePeriodActionResult =
  | { ok: true; result: ClosePeriodResult }
  | { ok: false; forbidden: true }
  | { ok: false; blocked: true; readiness: PeriodCloseReadiness }
  | { ok: false; error?: string }

/**
 * Closing writes (open / close / reopen) are owner/admin-only, matching the repo
 * convention (`closing/income-tax/actions.ts` → `authorizeOrgAdmin`). `role` is
 * the caller's DB membership role, resolved server-side, never taken from input.
 */
function isOrgManager(role: string): boolean {
  return role === "owner" || role === "admin"
}

type ReopenPeriodActionResult =
  | { ok: true; result: ReopenPeriodResult }
  | { ok: false; forbidden: true }
  | { ok: false; blocked: true }
  | { ok: false; error?: string }

/**
 * Open the next účetní období from a prior period (copies its regime, accounting
 * currency, fx policy, and chart of accounts forward; does NOT post opening
 * balances — the close carryover posts the 701). Restricted to owner/admin: a
 * Closing write that creates the next fiscal year is not for member/agent/guest.
 */
export async function openPeriodAction(input: {
  slug: string
  priorPeriodId: string
  periodStart: string
  periodEnd: string
  accountingCurrency?: string
  fxRatePolicy?: FxRateKind | null
}): Promise<OpenPeriodActionResult> {
  const session = await getRequestSession()
  const userId = session?.user?.id
  if (!userId) return { ok: false }

  const membership = await resolveMembership({ slug: input.slug, userId })
  if (!membership) return { ok: false }
  const { organizationId, workspaceId, role } = membership

  // Owner/admin authz gate — refuse a member/agent/guest BEFORE any domain call.
  if (!isOrgManager(role)) return { ok: false, forbidden: true }

  try {
    const { newPeriodId } = await withOrganization(
      organizationId,
      userId,
      (db) =>
        openPeriod(
          db,
          { organizationId, workspaceId },
          {
            priorPeriodId: input.priorPeriodId,
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
            accountingCurrency: input.accountingCurrency,
            fxRatePolicy: input.fxRatePolicy,
          },
        ),
    )
    revalidatePath(orgHref(input.slug, PERIODS_ROUTE))
    return { ok: true, newPeriodId }
  } catch (e) {
    // Log the raw error server-side; return a generic message so no internal
    // identifier / SQL text leaks to the client.
    console.error("openPeriodAction failed", e)
    return { ok: false, error: "Could not open the accounting period." }
  }
}

/**
 * Close an účetní období end to end (result close → 702 → output → carryover).
 * `responsibleUserId` is the SESSION user, injected server-side. A readiness
 * failure throws PeriodCloseBlockedError, surfaced as `{ blocked, readiness }`
 * so the caller can render the outstanding checks. Restricted to owner/admin:
 * sealing a fiscal year (posts 702/710 + carryover 701, locks the period) is not
 * for member/agent/guest.
 */
export async function closePeriodAction(input: {
  slug: string
  periodId: string
}): Promise<ClosePeriodActionResult> {
  const session = await getRequestSession()
  const userId = session?.user?.id
  if (!userId) return { ok: false }

  const membership = await resolveMembership({ slug: input.slug, userId })
  if (!membership) return { ok: false }
  const { organizationId, workspaceId, role } = membership

  // Owner/admin authz gate — refuse a member/agent/guest BEFORE any domain call.
  if (!isOrgManager(role)) return { ok: false, forbidden: true }

  try {
    const result = await withOrganization(organizationId, userId, (db) =>
      closePeriod(
        db,
        { organizationId, workspaceId },
        { priorPeriodId: input.periodId, responsibleUserId: userId },
      ),
    )
    revalidatePath(orgHref(input.slug, PERIODS_ROUTE))
    return { ok: true, result }
  } catch (e) {
    if (e instanceof PeriodCloseBlockedError) {
      return { ok: false, blocked: true, readiness: e.readiness }
    }
    // Log the raw error server-side; return a generic message so no internal
    // identifier / SQL text leaks to the client.
    console.error("closePeriodAction failed", e)
    return { ok: false, error: "Could not close the accounting period." }
  }
}

/**
 * Reopen a CLOSED účetní období (storno cascade of its year-end close). The
 * single riskiest accounting operation, so this action is the AUTHZ OWNER:
 * reopening is restricted to owner/admin here, BEFORE any domain call. The
 * domain reopenPeriod deliberately carries no actor-authz check (only
 * org-visibility). `reopenedBy` is the SESSION user, injected server-side —
 * never taken from input. A precondition failure throws
 * PeriodReopenBlockedError, surfaced as `{ blocked }`.
 */
export async function reopenPeriodAction(input: {
  slug: string
  periodId: string
  reason?: string
}): Promise<ReopenPeriodActionResult> {
  const session = await getRequestSession()
  const userId = session?.user?.id
  if (!userId) return { ok: false }

  const membership = await resolveMembership({ slug: input.slug, userId })
  if (!membership) return { ok: false }
  const { organizationId, workspaceId, role } = membership

  // Owner/admin authz gate — refuse a member/agent/guest BEFORE touching the
  // domain. `role` comes from the DB membership, never from input.
  if (!isOrgManager(role)) return { ok: false, forbidden: true }

  try {
    const result = await withOrganization(organizationId, userId, (db) =>
      reopenPeriod(
        db,
        { organizationId, workspaceId },
        // reopenedBy = the session user, injected here; never from input.
        { periodId: input.periodId, reopenedBy: userId, reason: input.reason },
      ),
    )
    revalidatePath(orgHref(input.slug, PERIODS_ROUTE))
    return { ok: true, result }
  } catch (e) {
    if (e instanceof PeriodReopenBlockedError) {
      return { ok: false, blocked: true }
    }
    // Log the raw error server-side; return a generic message so no internal
    // identifier / SQL text leaks to the client.
    console.error("reopenPeriodAction failed", e)
    return { ok: false, error: "Could not reopen the accounting period." }
  }
}
