import "server-only"

import { desc, eq } from "drizzle-orm"
import { withAdminBypass } from "@workspace/db"
import { accounting_period } from "@workspace/db/schema"

/**
 * Cookie holding the active accounting-period id. The org layout reads it
 * (`resolveActivePeriodId`) and the period switcher writes it via a server
 * action. A single cookie is deliberate: it carries at most one period id, so
 * a user with several orgs "sticks" only on the org that period belongs to;
 * for the others `resolveActivePeriodId` falls back to a sensible default.
 */
export const PERIOD_COOKIE = "afframe_period"

/**
 * One accounting period as read for the app-shell period switcher — the
 * DB-native shape (`period_start` / `period_end` ISO dates + `status`). The
 * client wrapper's `toPeriod` formatter maps this into the presentational
 * `{ label, headerLabel, closed }` contract.
 */
export interface HeaderPeriod {
  id: string
  period_start: string
  period_end: string
  status: "OPEN" | "CLOSED"
}

/**
 * The org's accounting periods, newest first, for the header switcher.
 *
 * Runs under `withAdminBypass` with an explicit `organization_id` filter — the
 * same sanctioned header-bootstrap path as `getHeaderOrgData`. The org GUC is
 * not bound in the layout (it is bound per server action / route handler, see
 * the layout comment), so a `withOrganization` read here would have no GUC to
 * scope by; the explicit equality filter is the tenant boundary.
 */
export async function getHeaderPeriods(input: {
  organizationId: string
}): Promise<HeaderPeriod[]> {
  return await withAdminBypass(async (db) => {
    return await db
      .select({
        id: accounting_period.id,
        period_start: accounting_period.period_start,
        period_end: accounting_period.period_end,
        status: accounting_period.status,
      })
      .from(accounting_period)
      .where(eq(accounting_period.organization_id, input.organizationId))
      .orderBy(desc(accounting_period.period_start), desc(accounting_period.id))
  })
}

/**
 * Resolve which period is active: the cookie value when it names one of the
 * org's periods, else the newest OPEN period, else the newest period, else
 * `null` (org has no periods). The cookie is self-validating — a stale id from
 * another org never matches, so it silently falls back.
 *
 * Returns the full row (not just the id) so callers that need the period's
 * dates — `getOrgAccountingContext` — don't have to re-`.find()` it.
 */
export function resolveActivePeriod(
  periods: HeaderPeriod[],
  cookieValue: string | undefined | null,
): HeaderPeriod | null {
  if (cookieValue) {
    const matched = periods.find((p) => p.id === cookieValue)
    if (matched) return matched
  }
  const firstOpen = periods.find((p) => p.status === "OPEN")
  return firstOpen ?? periods[0] ?? null
}

/** Same resolution as {@link resolveActivePeriod}, returning just the id. */
export function resolveActivePeriodId(
  periods: HeaderPeriod[],
  cookieValue: string | undefined | null,
): string | null {
  return resolveActivePeriod(periods, cookieValue)?.id ?? null
}
