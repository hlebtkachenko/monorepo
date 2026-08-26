import { notFound } from "next/navigation"

import { Card, CardContent } from "@workspace/ui/components/card"

import { getBetaTranslations } from "@/i18n/translations-server"
import { publishedBatchFor } from "@/lib/data/imports"
import {
  payrollScope,
  payrollSummaryForPeriod,
  publishedPayrollPeriods,
} from "@/lib/data/payroll"
import { formatBetaDateTime } from "@/lib/format/date"

import { resolveOrgScope } from "../_lib/org-scope"

import { PayrollSummaryCard } from "./_components/payroll-summary-card"
import { PayrollTrendTable } from "./_components/payroll-trend-table"
import { PeriodPicker } from "./_components/period-picker"
import { PERIOD_PARAM, selectPeriod } from "./_lib/period-selection"

/** How many published periods the trend table shows, newest first. */
const TREND_PERIOD_LIMIT = 12

/**
 * Přehled mezd (spec §2.6) — the module root, so the rail entry lands here.
 *
 * READ-ONLY, MANAGEMENT SEATS ONLY. `mzdy/layout.tsx` already refuses every
 * other role with a 404 before a browser reaches this page — but a page-level
 * test calls this function directly, the same way `uzaverka/page.tsx` proves
 * its own owner gate, so the `payrollScope` check is repeated here rather than
 * assumed. Belt and suspenders on purpose: the gate that gives a definitive
 * 404 must be provable on its own terms, not only through a layout a test (or
 * a future route) might not run.
 *

 * NOTHING IS COMPUTED HERE. `PayrollSummaryCard` renders the office's own
 * figures unchanged (spec §0.2); this page's only job is picking a period —
 * from `publishedPayrollPeriods`, the same "offer only what has a published
 * batch" contract `loadDataset` gives Výkazy — and fetching the freshness
 * stamp alongside it (`publishedBatchFor`, the generic import-spine reader:
 * safe to call unguarded here because the whole route is already gated).
 */
export default async function PrehledMezdPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ [PERIOD_PARAM]?: string }>
}) {
  const { orgSlug } = await params
  const requested = (await searchParams)[PERIOD_PARAM]

  const scope = await resolveOrgScope(orgSlug)
  if (payrollScope(scope).kind !== "all") notFound()

  const [t, periods] = await Promise.all([
    getBetaTranslations(),
    publishedPayrollPeriods(scope),
  ])
  const period = selectPeriod(periods, requested)
  const basePath = `/${orgSlug}/mzdy`

  if (!period) {
    return (
      <div className="grid gap-4">
        <h1 className="font-heading text-lg font-semibold">
          {t("mzdy.title")}
        </h1>
        <Card>
          <CardContent className="grid gap-1 py-10 text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              {t("mzdy.emptyHeading")}
            </p>
            <p>{t("mzdy.emptyPrehled")}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const trendPeriods = periods.slice(0, TREND_PERIOD_LIMIT)
  const [summary, batch, trendSummaries] = await Promise.all([
    payrollSummaryForPeriod(scope, period.id),
    publishedBatchFor(scope, { periodId: period.id, dataset: "payroll" }),
    Promise.all(
      trendPeriods.map((trendPeriod) =>
        payrollSummaryForPeriod(scope, trendPeriod.id),
      ),
    ),
  ])

  const trendRows = trendPeriods.map((trendPeriod, index) => ({
    period: trendPeriod,
    summary: trendSummaries[index] ?? null,
  }))

  return (
    <div className="grid gap-6">
      <div className="grid gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="font-heading text-lg font-semibold">
            {t("mzdy.title")}
          </h1>
          {batch?.publishedAt ? (
            <p className="text-xs text-muted-foreground">
              {t("mzdy.publishedAt")} {formatBetaDateTime(batch.publishedAt)} ·{" "}
              {t(
                batch.source === "agent"
                  ? "mzdy.sourceAgent"
                  : "mzdy.sourceManual",
              )}
            </p>
          ) : null}
        </div>
        <PeriodPicker basePath={basePath} periods={periods} current={period} />
      </div>

      {summary ? (
        <PayrollSummaryCard summary={summary} />
      ) : (
        <Card>
          <CardContent className="grid gap-1 py-10 text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              {t("mzdy.emptyHeading")}
            </p>
            <p>{t("mzdy.emptyPrehled")}</p>
          </CardContent>
        </Card>
      )}

      {trendRows.length > 0 ? (
        <div className="grid gap-2">
          <h2 className="font-heading text-sm font-semibold">
            {t("mzdy.trendTitle")}
          </h2>
          <PayrollTrendTable rows={trendRows} />
        </div>
      ) : null}
    </div>
  )
}
