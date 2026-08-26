import { StatementTable } from "@/app/_components/statement-table"
import { statementLinesForBatch } from "@/lib/data/imports"

import { resolveOrgScope } from "../../_lib/org-scope"

import { DatasetHeader } from "../_components/dataset-header"
import { NothingPublished } from "../_components/nothing-published"
import { vzzHighlights } from "../_lib/highlights"
import { loadDataset } from "../_lib/load-dataset"
import { PERIOD_PARAM } from "../_lib/period-selection"
import { vykazyHref } from "../_nav/vykazy-nav"

/**
 * Výsledovka — výkaz zisku a ztráty (spec §2.5).
 *
 * ONE STATEMENT KIND, two columns (běžné / minulé), and the výsledek
 * hospodaření headline the spec asks for — read off the `***` řádek the
 * office published, not computed from the rows above it (see `vzzHighlights`).
 *
 * NO TREND CHART. Spec §2.5 allows one "where monthly imports exist"; a chart
 * is a second read across periods and a second way to be wrong about which
 * batch a point came from, and the period picker already answers the question
 * it would answer. It is a deliberate omission, not an oversight — the row's
 * own `minulé` column is the period-over-period comparison the statutory form
 * itself carries.
 */
export default async function VysledovkaPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ obdobi?: string }>
}) {
  const { orgSlug } = await params
  const requested = (await searchParams)[PERIOD_PARAM]

  const scope = await resolveOrgScope(orgSlug)
  const view = await loadDataset(scope, "vzz", requested)
  const lines = view.batch
    ? await statementLinesForBatch(scope, view.batch.id, {
        statementKind: "vzz",
      })
    : []

  return (
    <div className="grid gap-6">
      <DatasetHeader
        basePath={vykazyHref(orgSlug, "vzz")}
        titleKey="vykazy.vzzTitle"
        view={view}
        highlights={vzzHighlights(lines)}
      />

      {view.batch === null ? (
        <NothingPublished bodyKey="vykazy.emptyVzz" />
      ) : (
        <StatementTable
          kind="vzz"
          captionKey="vykazy.captionVzz"
          lines={lines}
        />
      )}
    </div>
  )
}
