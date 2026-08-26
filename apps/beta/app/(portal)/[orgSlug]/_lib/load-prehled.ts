import "server-only"

import { assetResidualSummaryForScope } from "@/lib/data/assets"
import type { AssetResidualSummary } from "@/lib/data/assets"
import { openClientTasksForScope } from "@/lib/data/client-tasks"
import { upcomingDeadlinesForScope } from "@/lib/data/deadlines"
import type { UpcomingDeadline } from "@/lib/data/deadlines"
import { listDocuments } from "@/lib/data/documents"
import { datasetFreshnessForScope } from "@/lib/data/imports"
import type { DatasetFreshness } from "@/lib/data/imports"
import { obligationsForScope } from "@/lib/data/obligations"
import type { ObligationsReadModel } from "@/lib/data/obligations"
import { organizationCardForScope } from "@/lib/data/organizations"
import {
  payrollSummaryForPeriod,
  publishedPayrollPeriods,
} from "@/lib/data/payroll"
import type {
  ClientTaskView,
  DocumentSummary,
  OrganizationCard,
  PayrollSummaryView,
  ReportingPeriodView,
} from "@/lib/data/projections"
import type { OrgScope } from "@/lib/data/scope"
import { betaTodayIso } from "@/lib/format/date"
import type { TurnoverReading } from "@/lib/turnover"

/**
 * Everything Přehled (`/[orgSlug]`, spec §2.1) reads, in one place.
 *
 * WHY A LOADER RATHER THAN SEVEN AWAITS IN `page.tsx`. Two of §2.1's decisions
 * are not about any single card — the FIRST-MONTH STATE (Advisor F18) is a
 * judgement over every feeder at once, and DATA PRESENCE (§2.1 item 3: tiles
 * "appear on DATA PRESENCE ... never zero-value placeholders") is the same
 * question asked per dataset. Both are the kind of rule that rots when it lives
 * inside JSX: a card added later renders itself and quietly breaks the
 * composition. Here they are values, and `load-prehled.db.test.ts` asserts them
 * against real rows.
 *
 * EIGHT READS IN PARALLEL, PLUS ONE DEPENDENT NINTH, NONE OF THEM NEW
 * ARITHMETIC. Every sum on this page was computed by Postgres in the module
 * that owns it (§0.2); this file chooses which of them exist, never what
 * they are. The payroll summary is the one read that cannot join the
 * `Promise.all` below — it needs the newest published period's id, which is
 * itself one of the eight — so it runs as a second, dependent await, the same
 * shape `payroll/page.tsx` already uses for its own period-then-summary read.
 */

/** §2.1 item 6: "Poslední dokumenty — 5 rows, status chips". */
const RECENT_DOCUMENT_COUNT = 5

type PrehledDocuments = {
  /** Newest first, at most `RECENT_DOCUMENT_COUNT`. */
  recent: DocumentSummary[]
  /** Every document this reader may see, for the presence row. */
  total: number
  /** When the newest one was uploaded, or null on an empty book. */
  newestUploadedAt: string | null
}

export type PrehledData = {
  org: OrganizationCard
  tasks: ClientTaskView[]
  deadlines: UpcomingDeadline[]
  obligations: ObligationsReadModel
  assets: AssetResidualSummary
  datasets: DatasetFreshness[]
  documents: PrehledDocuments
  /**
   * Mzdové náklady tile's feeder (spec §2.1 item 3, kpi-tiles.tsx's own
   * header: "mzdové náklady needs payroll_summary to exist" — it landed in
   * PR 30). The NEWEST published payroll period and its summary, or `null`
   * for either an unlinked guest (`payrollScope` fails closed the same way it
   * does for every other payroll read) or a book with no published payroll
   * batch yet. `summary` can still be `null` even with a period present — the
   * batch exists but the office has not stated `employer_cost_total` — and
   * `page.tsx` treats that exactly like "no period" (§2.1's presence rule:
   * the tile renders only where a REAL figure exists to show).
   */
  payroll: {
    period: ReportingPeriodView
    summary: PayrollSummaryView | null
  } | null
  /**
   * The office-provided obrat figure — ALWAYS NULL TODAY, and deliberately so.
   *
   * §2.1 item 4 names two feeders for it ("indicator annual_turnover or VZZ
   * výnosy import") and NEITHER EXISTS: `indicator_definition` /
   * `indicator_value` (spec §4) have no migration, and which VZZ řádek an
   * office's export calls total výnosy is a mapping Výkazy (PR 25) has to
   * establish rather than something this page may infer. §0.2 forbids the
   * obvious shortcut — "the portal never derives an accounting fact" — and obrat
   * is the worst possible figure to approximate, since it decides whether a
   * company has a DPH registration duty.
   *
   * So the card renders an honest absence (`TURNOVER_SOURCES` names both feeds
   * as unconnected) and this stays `null` until one of them lands, at which
   * point exactly this line changes.
   */
  turnover: TurnoverReading | null
  /** Prague-local `YYYY-MM-DD`, for the §0.4 freshness bands. */
  today: string
  /**
   * Advisor F18's first-month state: this book has no accounting data AT ALL
   * yet.
   *
   * THREE CONDITIONS, AND EACH ONE IS A WHOLE FEEDER BEING SILENT:
   *   - no dataset has ever been published (§0.4's "before any import");
   *   - no filing and no liability row has ever existed (the obligations
   *     sources stamp themselves whether or not they currently owe anything —
   *     see `ObligationSourceFreshness`, which is why this can tell "nothing
   *     outstanding" apart from "never fed");
   *   - no asset has ever been registered.
   *
   * DOCUMENTS AND TASKS ARE NOT PART OF IT, on purpose. F18 says the first-month
   * page still renders "karta + tasks + termíny + dokumenty" — a client
   * uploading their first invoices before the office has closed anything IS the
   * first month, not the end of it. Including uploads would make the explanatory
   * card vanish at the exact moment it is most needed.
   *
   * What it drives (see `page.tsx`): the KPI tiles and the data-presence grid
   * are replaced by ONE card saying financial overviews arrive after the first
   * monthly close. Not hidden behind a spinner, not drawn as empty charts —
   * F18's "No empty charts" and §0.3's no-placeholders rule are the same rule
   * seen from two sides.
   */
  firstMonth: boolean
}

export async function loadPrehled(scope: OrgScope): Promise<PrehledData> {
  const [
    org,
    tasks,
    deadlines,
    obligations,
    assets,
    datasets,
    documentPage,
    payrollPeriods,
  ] = await Promise.all([
    organizationCardForScope(scope),
    openClientTasksForScope(scope),
    upcomingDeadlinesForScope(scope),
    obligationsForScope(scope),
    assetResidualSummaryForScope(scope),
    datasetFreshnessForScope(scope),
    listDocuments(scope),
    publishedPayrollPeriods(scope),
  ])

  const recent = documentPage.documents.slice(0, RECENT_DOCUMENT_COUNT)

  // The newest published payroll period only — the KPI tile is one number,
  // not the 12-month trend Přehled mezd itself renders, so a second read per
  // period would cost far more than this page's one tile is worth.
  const latestPayrollPeriod = payrollPeriods[0] ?? null
  const payrollSummary = latestPayrollPeriod
    ? await payrollSummaryForPeriod(scope, latestPayrollPeriod.id)
    : null

  return {
    org,
    tasks,
    deadlines,
    obligations,
    assets,
    datasets,
    payroll: latestPayrollPeriod
      ? { period: latestPayrollPeriod, summary: payrollSummary }
      : null,
    documents: {
      recent,
      total: documentPage.total,
      // The list is `created_at DESC`, so the first row IS the newest — no
      // second query, and no date compared in JavaScript.
      newestUploadedAt: documentPage.documents[0]?.uploadedAt ?? null,
    },
    turnover: null,
    today: betaTodayIso(),
    firstMonth:
      datasets.every((dataset) => dataset.period === null) &&
      obligations.freshness.every(
        (source) => source.sourceUpdatedAt === null,
      ) &&
      assets.inUseCount === 0,
  }
}

/**
 * Whether the obligations feeds have ever been fed — spec §2.1 item 3's "appear
 * on DATA PRESENCE" for the "otevřené závazky" tile.
 *
 * PRESENCE IS THE SOURCE HAVING ROWS, NOT THE TOTAL BEING NON-ZERO. A book whose
 * filings are all paid genuinely owes 0 Kč, and that measured zero is worth
 * showing — it is the answer to "am I straight with the úřad". What must never
 * render is a zero that means "nobody has told us anything", which is the
 * placeholder §2.1 forbids, and the two are indistinguishable once the tile is
 * on screen. Hence the question is asked HERE, of the freshness stamps, and the
 * tile is simply absent when the answer is no.
 */
export function hasObligationData(model: ObligationsReadModel): boolean {
  return model.freshness.some(
    (source) => source.implemented && source.sourceUpdatedAt !== null,
  )
}

/**
 * The §2.4 stamp for the obligations tile: the newest of the fed sources' own
 * stamps.
 *
 * Picking the later of two ISO instants rendered by Postgres in one fixed-width
 * UTC form is a string comparison, the same one `groupObligations` makes for the
 * per-group stamp — not date arithmetic, and not a second opinion about what
 * "fresh" means.
 */
export function obligationsAsOf(model: ObligationsReadModel): string | null {
  return model.freshness.reduce<string | null>((latest, source) => {
    if (source.sourceUpdatedAt === null) return latest
    return latest === null || source.sourceUpdatedAt > latest
      ? source.sourceUpdatedAt
      : latest
  }, null)
}
