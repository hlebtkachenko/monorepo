import "server-only"

import { cache } from "react"
import { cookies } from "next/headers"
import { desc, eq } from "drizzle-orm"
import { withOrgReadonly } from "@workspace/db"
import { accounting_period } from "@workspace/db/schema"

/**
 * Accounting-period reads + active-period resolution for the rebuilt org tree.
 *
 * The rebuild makes the URL the single source of truth for the active period:
 * pages read `?period=<id>` from their `searchParams` and pass it to
 * {@link getActivePeriod}; the cookie is only a sticky default for the next
 * visit (written by `setPeriodDefault`, never read as authoritative here except
 * as the fallback when the URL carries no period). This kills the old tree's
 * per-page cookie re-derivation and the cross-org cookie-stick bug.
 *
 * Owned by the new tree (`apps/web/lib/org/`); mirrors the reads in the frozen
 * old tree's `[orgSlug]/_lib/header-periods.ts`.
 */

/** Sticky-default cookie for the active period. Not authoritative — the URL is. */
export const PERIOD_COOKIE = "afframe_period"

/** One accounting period, DB-native shape, for the app-shell period switcher. */
export interface HeaderPeriod {
  id: string
  period_start: string
  period_end: string
  status: "OPEN" | "CLOSED"
}

/**
 * The org's accounting periods, newest first, keyed by the primitive org id +
 * user id so `React.cache` actually memoizes (an object arg would be a fresh
 * reference every call, which cache can't dedup). The layout (switcher list) and
 * each page (period-scoped data) resolve different active periods but share this
 * one DB read per RSC request.
 *
 * Runs under `withOrgReadonly`: it binds `app.organization_id` (+ `app.user_id`)
 * so the `accounting_period` FORCE-RLS `organization_isolation` policy is the
 * tenant boundary, and runs the transaction READ ONLY so this RSC read provably
 * cannot mutate. The explicit `organization_id` filter is defense-in-depth.
 */
const getPeriods = cache(
  async (organizationId: string, userId: string): Promise<HeaderPeriod[]> =>
    withOrgReadonly(organizationId, userId, async (db) =>
      db
        .select({
          id: accounting_period.id,
          period_start: accounting_period.period_start,
          period_end: accounting_period.period_end,
          status: accounting_period.status,
        })
        .from(accounting_period)
        .where(eq(accounting_period.organization_id, organizationId))
        .orderBy(
          desc(accounting_period.period_start),
          desc(accounting_period.id),
        ),
    ),
)

/**
 * Resolve the active period from a list: the requested id when it names one of
 * the org's periods, else the newest OPEN period, else the newest, else null.
 * Self-validating — a stale/cross-org id never matches and silently falls back.
 */
export function resolveActivePeriod(
  periods: HeaderPeriod[],
  requested: string | undefined | null,
): HeaderPeriod | null {
  if (requested) {
    const matched = periods.find((p) => p.id === requested)
    if (matched) return matched
  }
  const firstOpen = periods.find((p) => p.status === "OPEN")
  return firstOpen ?? periods[0] ?? null
}

export interface ActivePeriodState {
  periods: HeaderPeriod[]
  active: HeaderPeriod | null
}

/**
 * Fetch the org's periods and resolve the active one, memoized per RSC request.
 *
 * Precedence: `requested` (the `?period=` URL param) → the sticky cookie
 * default → newest OPEN → newest. Pass the page's `searchParams.period` as
 * `requested`; the URL always wins so periods are deep-linkable and per-tab.
 * The layout calls it with no `requested` (it can't read `searchParams`) to get
 * the cookie/default active period for the switcher's initial value; the client
 * switcher then overrides from the live URL.
 */
export const getActivePeriod = cache(
  async (
    organizationId: string,
    userId: string,
    requested?: string | null,
  ): Promise<ActivePeriodState> => {
    const periods = await getPeriods(organizationId, userId)
    const cookieDefault = (await cookies()).get(PERIOD_COOKIE)?.value
    const active = resolveActivePeriod(periods, requested ?? cookieDefault)
    return { periods, active }
  },
)
