import { StatementTable } from "@/app/_components/statement-table"
import { statementLinesForBatch } from "@/lib/data/imports"

import { resolveOrgScope } from "../_lib/org-scope"

import { DatasetHeader } from "./_components/dataset-header"
import { NothingPublished } from "./_components/nothing-published"
import { rozvahaHighlights } from "./_lib/highlights"
import { loadDataset } from "./_lib/load-dataset"
import { PERIOD_PARAM } from "./_lib/period-selection"
import { vykazyHref } from "./_nav/vykazy-nav"

/**
 * Rozvaha (spec §2.5) — the module root, so the rail entry lands here.
 *
 * TWO TABLES, ONE BATCH. Aktiva and pasiva are separate `statement_kind`s
 * because they have different column shapes (Advisor F7/F8), but they are ONE
 * published `rozvaha` batch: the office publishes both sides of a balance
 * sheet together or the statement does not foot. So the period, the freshness
 * stamp and the top strip are shared, and only the tables differ.
 *
 * The two payload reads are issued together — they hit the same batch id and
 * neither depends on the other's result.
 */
export default async function RozvahaPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ obdobi?: string }>
}) {
  const { orgSlug } = await params
  const requested = (await searchParams)[PERIOD_PARAM]

  const scope = await resolveOrgScope(orgSlug)
  const view = await loadDataset(scope, "rozvaha", requested)

  const [aktiva, pasiva] = view.batch
    ? await Promise.all([
        statementLinesForBatch(scope, view.batch.id, {
          statementKind: "rozvaha_aktiva",
        }),
        statementLinesForBatch(scope, view.batch.id, {
          statementKind: "rozvaha_pasiva",
        }),
      ])
    : [[], []]

  return (
    <div className="grid gap-6">
      <DatasetHeader
        basePath={vykazyHref(orgSlug, "")}
        titleKey="vykazy.rozvahaTitle"
        view={view}
        highlights={rozvahaHighlights(aktiva, pasiva)}
      />

      {view.batch === null ? (
        <NothingPublished bodyKey="vykazy.emptyRozvaha" />
      ) : (
        <div className="grid gap-8">
          <StatementTable
            kind="rozvaha_aktiva"
            captionKey="vykazy.captionAktiva"
            lines={aktiva}
          />
          <StatementTable
            kind="rozvaha_pasiva"
            captionKey="vykazy.captionPasiva"
            lines={pasiva}
          />
        </div>
      )}
    </div>
  )
}
