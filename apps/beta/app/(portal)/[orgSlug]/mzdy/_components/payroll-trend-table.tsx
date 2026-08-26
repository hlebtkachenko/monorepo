import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { getBetaTranslations } from "@/i18n/translations-server"
import type {
  PayrollSummaryView,
  ReportingPeriodView,
} from "@/lib/data/projections"
import { formatBetaMoney } from "@/lib/format/money"
import { formatReportingPeriodLabel } from "@/lib/format/period-label"

/**
 * The "12-mo trend" spec §2.6 asks for on Přehled mezd, as a plain table
 * rather than a chart.
 *
 * NO SPARKLINE, DELIBERATELY. `_components/kpi-tiles.tsx` (Přehled, PR 20)
 * already made this call for its own single-point tiles ("drawing a flat line
 * through one point is the empty chart F18 rules out"); this component has
 * genuine multi-period history to show, but this codebase has not built a
 * charting primitive anywhere yet, and one component's trend is not the
 * occasion to introduce one. A table row per period is the honest,
 * already-available way to show the same numbers.
 *
 * ONE ROW PER PERIOD THE CALLER PASSED IN, in the order given (newest first —
 * `publishedPayrollPeriods`'s own contract). A period with no summary row at
 * all (a gap in the office's uploads) renders every figure as "Neuvedeno"
 * rather than being dropped — an absent month is information, not a
 * discontinuity to smooth over.
 */
export async function PayrollTrendTable({
  rows,
}: {
  rows: readonly {
    period: ReportingPeriodView
    summary: PayrollSummaryView | null
  }[]
}) {
  const t = await getBetaTranslations()
  const notStated = t("mzdy.amountNotStated")
  const money = (value: string | null | undefined) =>
    (value ? formatBetaMoney(value) : null) ?? notStated

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("mzdy.trendColumnPeriod")}</TableHead>
          <TableHead className="text-right">{t("mzdy.netPaidTotal")}</TableHead>
          <TableHead className="text-right">
            {t("mzdy.employerCostTotal")}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(({ period, summary }) => (
          <TableRow key={period.id}>
            <TableCell className="font-medium">
              {formatReportingPeriodLabel(period)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {money(summary?.netPaidTotal)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {money(summary?.employerCostTotal)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
