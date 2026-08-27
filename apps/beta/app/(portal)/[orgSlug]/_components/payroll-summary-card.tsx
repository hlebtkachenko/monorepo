import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { getBetaTranslations } from "@/i18n/translations-server"
import type { BetaMessageKey } from "@/i18n/messages"
import type { PayrollSummaryView } from "@/lib/data/projections"
import { formatBetaDate } from "@/lib/format/date"
import { formatBetaMoney } from "@/lib/format/money"

/**
 * The figures of one payroll period (spec §2.6 Přehled mezd).
 *
 * READ AS STORED, RENDERED AS STORED. Every read that hands this component a
 * `PayrollSummaryView` already guarantees every value is the office's own —
 * this component adds Czech labels and the §0.4 fallback for a NULL figure
 * ("Neuvedeno", never "0 Kč") and nothing else. `employerCostTotal` is spec
 * §2.6's "celkové náklady na zaměstnance" and is never called "superhrubá
 * mzda" (the schema header on `payroll_summary.ts` explains why); the
 * breakdown rows below it are labelled with the statutory rates spec §2.6
 * names so a reader can check the figures against them, which is context, not
 * an arithmetic this component performs.
 *
 * SHARED, in the org-level `_components/` — TWO callers render it:
 * `mzdy/page.tsx` (the PUBLISHED period Přehled mezd shows) and the
 * `uzaverka/[batchId]` payroll arm (manual-entry plan §3, W4 — a DRAFT or
 * superseded batch's own summary, same shape either way since a batch's
 * payroll_summary row is read identically regardless of status).
 */
export async function PayrollSummaryCard({
  summary,
}: {
  summary: PayrollSummaryView
}) {
  const t = await getBetaTranslations()
  const notStated = t("mzdy.amountNotStated")
  const money = (value: string | null) => formatBetaMoney(value) ?? notStated

  const rows: { labelKey: BetaMessageKey; value: string }[] = [
    { labelKey: "mzdy.employerSocial", value: money(summary.employerSocial) },
    { labelKey: "mzdy.employerHealth", value: money(summary.employerHealth) },
    {
      labelKey: "mzdy.employeeWithholdingsTotal",
      value: money(summary.employeeWithholdingsTotal),
    },
    {
      labelKey: "mzdy.incomeTaxAdvance",
      value: money(summary.incomeTaxAdvance),
    },
  ]

  const headcounts: { labelKey: BetaMessageKey; value: number | null }[] = [
    { labelKey: "mzdy.headcountHpp", value: summary.headcountHpp },
    { labelKey: "mzdy.headcountDpc", value: summary.headcountDpc },
    { labelKey: "mzdy.headcountDpp", value: summary.headcountDpp },
  ]

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-sm text-muted-foreground">
            {t("mzdy.employerCostTotal")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1">
          <p className="text-2xl font-semibold tabular-nums">
            {money(summary.employerCostTotal)}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((row) => (
          <Card key={row.labelKey}>
            <CardHeader>
              <CardTitle className="font-heading text-xs text-muted-foreground">
                {t(row.labelKey)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold tabular-nums">{row.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-sm text-muted-foreground">
            {t("mzdy.netPaidTotal")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1">
          <p className="text-2xl font-semibold tabular-nums">
            {money(summary.netPaidTotal)}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("mzdy.paymentDueDate")}{" "}
            {summary.paymentDueDate
              ? formatBetaDate(summary.paymentDueDate)
              : notStated}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        {headcounts.map((row) => (
          <Card key={row.labelKey}>
            <CardHeader>
              <CardTitle className="font-heading text-xs text-muted-foreground">
                {t(row.labelKey)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold tabular-nums">
                {row.value ?? notStated}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {summary.noteClient ? (
        <p className="text-sm text-muted-foreground">{summary.noteClient}</p>
      ) : null}
    </div>
  )
}
