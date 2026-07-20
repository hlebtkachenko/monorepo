import "server-only"

import { getActivePeriod } from "@/lib/org/period"
import { resolveMembership } from "@/lib/org/resolve"
import { getRequestSession } from "@/lib/org/session"

/**
 * Period-list view models for the Closing → Účetní období page.
 *
 * The list is READ-ONLY presentation over the real `accounting_period` rows: it
 * reuses `getActivePeriod` (one cached DB read per RSC request, shared with the
 * header switcher) and derives the display columns. Tenancy is resolved
 * server-side from the slug exactly like `listFavorites` — `userId` from the
 * session, `organizationId` from `resolveMembership({ slug, userId })` — so only
 * an org the caller belongs to resolves; the read itself runs under
 * `withOrgReadonly` inside `getActivePeriod`.
 */

/** Display state of a period row. `active` = the currently-resolved period. */
export type PeriodStav = "active" | "open" | "closed"

/** One accounting-period row projected for the Periods table. */
export interface PeriodListRow {
  /** DB id (uuid) — the row identity + inspector/select key. */
  id: string
  /**
   * Zkratka — the period's short code. Auto-derived from the fiscal year for
   * now; becomes a stored, user-editable column in a later slice (the auto value
   * is the default). Real data (a formatting of the period bounds), never a
   * placeholder.
   */
  zkratka: string
  /** Period start, `DD.MM.YYYY`. */
  od: string
  /** Period end, `DD.MM.YYYY`. */
  do: string
  /** Aktivní / Otevřené / Uzavřené. */
  stav: PeriodStav
  /** Fiscal year, derived from the bounds (the year the books close). Not editable. */
  rok: number
}

/** Fiscal year of a period — the calendar year in which it ends. */
export function fiscalYear(periodEnd: string): number {
  return Number(periodEnd.slice(0, 4))
}

/** Format a Postgres ISO date (`YYYY-MM-DD`) as Czech `DD.MM.YYYY`. */
function formatCzDate(iso: string): string {
  const [year, month, day] = iso.split("-")
  return `${day}.${month}.${year}`
}

/**
 * The org's accounting periods, newest first, projected for the Periods table.
 * `requestedPeriod` is the page's `?period=` param, threaded into the active
 * resolution so the "Aktivní" row matches the header switcher. Returns `[]` when
 * there is no session or membership (the layout already guards, this is
 * defense-in-depth).
 */
export async function listPeriods(input: {
  slug: string
  requestedPeriod?: string | null
}): Promise<PeriodListRow[]> {
  const session = await getRequestSession()
  const userId = session?.user?.id
  if (!userId) return []

  const membership = await resolveMembership({ slug: input.slug, userId })
  if (!membership) return []

  const { periods, active } = await getActivePeriod(
    membership.organizationId,
    userId,
    input.requestedPeriod,
  )

  return periods.map((period) => {
    const stav: PeriodStav =
      period.id === active?.id
        ? "active"
        : period.status === "OPEN"
          ? "open"
          : "closed"
    return {
      id: period.id,
      zkratka: String(fiscalYear(period.period_end)),
      od: formatCzDate(period.period_start),
      do: formatCzDate(period.period_end),
      stav,
      rok: fiscalYear(period.period_end),
    }
  })
}
