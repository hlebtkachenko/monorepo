import "server-only"

import { withOrgReadonly } from "@workspace/db"
import {
  DOCUMENT_SERIES_CATEGORIES,
  getDocumentSeries,
  listDocumentSeries,
} from "@workspace/accounting"
import type {
  DocumentCategory,
  DocumentSeriesRow,
  NumberSeriesPeriodRow,
} from "@workspace/accounting"

import { getActivePeriod } from "@/lib/org/period"

/**
 * App-edge reads for the Dokladové řady page. Runs the domain reads under
 * `withOrgReadonly` (org FORCE-RLS + READ ONLY) and projects the snake_case domain
 * rows into the camelCase view models the client Table + Inspector + numbering grid
 * consume. The 4 DOCUMENT_SERIES_CATEGORIES are the page's view tabs; each série
 * carries its per-účetní-období numbering rows for the grid. Pure config data — the
 * numbering counter (Akt.číslo) is display-only and never editable here.
 */

/** The 4 config categories the Dokladové řady page surfaces, re-exported so the
 *  page needs one import. */
export { DOCUMENT_SERIES_CATEGORIES }
export type { DocumentCategory }

/** One per-účetní-období numbering row as the grid consumes it (camelCase). */
export interface NumberSeriesPeriodView {
  id: string
  periodId: string
  numberLength: number
  prefix: string
  postfix: string
  /** Gapless counter — display-only; never editable/resettable from the UI. */
  currentNumber: number
}

/** One Dokladová řada (a DOCUMENT number series) + its per-období numbering rows. */
export interface DocumentSeriesView {
  id: string
  category: DocumentCategory | null
  code: string
  name: string | null
  note: string | null
  description: string | null
  validFromYear: number | null
  validToYear: number | null
  nextNumber: number
  periods: NumberSeriesPeriodView[]
}

/** One accounting period as the numbering grid's add-row picker consumes it. */
export interface ConfigurablePeriod {
  id: string
  label: string
}

function toPeriodView(r: NumberSeriesPeriodRow): NumberSeriesPeriodView {
  return {
    id: r.id,
    periodId: r.period_id,
    numberLength: r.number_length,
    prefix: r.prefix,
    postfix: r.postfix,
    currentNumber: r.current_number,
  }
}

function toSeriesView(
  series: DocumentSeriesRow,
  periods: NumberSeriesPeriodRow[],
): DocumentSeriesView {
  return {
    id: series.id,
    category: series.category,
    code: series.code,
    name: series.name,
    note: series.note,
    description: series.description,
    validFromYear: series.valid_from_year,
    validToYear: series.valid_to_year,
    nextNumber: series.next_number,
    periods: periods.map(toPeriodView),
  }
}

/**
 * Every DOCUMENT série (all 4 categories; the page filters by tab), each with its
 * per-období numbering rows attached. For a config page the N+1 (one period fetch
 * per série) is acceptable; it runs sequentially inside the single read-only
 * transaction (postgres.js serializes one connection per transaction).
 */
export async function getDocumentSeriesList(
  organizationId: string,
  userId: string,
): Promise<DocumentSeriesView[]> {
  return withOrgReadonly(organizationId, userId, async (db) => {
    const list = await listDocumentSeries(db, {})
    const views: DocumentSeriesView[] = []
    for (const series of list) {
      const detail = await getDocumentSeries(db, series.id)
      views.push(toSeriesView(series, detail?.periods ?? []))
    }
    return views
  })
}

/**
 * The org's accounting periods projected as `{ id, label }` for the numbering
 * grid's add-row picker. Reuses `getActivePeriod` (the shared, memoized read that
 * runs under `withOrgReadonly`); the label is the period's zkratka, falling back to
 * its fiscal year, exactly like the Účetní období list.
 */
export async function getConfigurablePeriods(
  organizationId: string,
  userId: string,
): Promise<ConfigurablePeriod[]> {
  const { periods } = await getActivePeriod(organizationId, userId)
  return periods.map((p) => ({
    id: p.id,
    label: p.zkratka ?? p.period_end.slice(0, 4),
  }))
}
