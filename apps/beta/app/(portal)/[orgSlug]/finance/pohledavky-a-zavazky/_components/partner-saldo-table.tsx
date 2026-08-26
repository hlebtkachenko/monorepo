import { Badge } from "@workspace/ui/components/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { formatAmount, formatDate } from "@/i18n/format-values"
import { getBetaTranslations } from "@/i18n/translations-server"
import type { PartnerSaldoView } from "@/lib/data/projections"
import {
  PARTNER_AGING_LABEL_KEY,
  PARTNER_ROLE_LABEL_KEY,
} from "@/lib/partner-labels"

/**
 * Finance › Pohledávky a závazky's one table (spec §2.4: "grouped per partner:
 * dlužné nám / dlužíme, oldest splatnost, aging signal").
 *
 * ONE ROW PER PARTNER, ALREADY GROUPED. The grouping is the saldokonto's own —
 * the office's export states a position per counterparty — so this component
 * neither groups nor sums; it renders what `saldokontoForScope` returned, in the
 * order Postgres returned it.
 *
 * A NULL IS A DASH, NEVER A ZERO. An export that stated only the payable side
 * left the other column NULL, and §0.4's "empty beats stale" applies at cell
 * granularity: "0 Kč" reads as a measured zero — "this partner owes us nothing"
 * — which is a claim the office never made.
 *
 * THE AGING CHIP IS ONLY LOUD WHEN IT IS BAD. `destructive` above 90 days,
 * `secondary` in between, `outline` for a position that is not overdue at all.
 * A page that shouted at every row would stop being read; §2.4 asks for a
 * signal, and a signal that never varies is not one.
 */
const AGING_VARIANT = {
  unknown: "outline",
  not_due: "outline",
  days_1_30: "secondary",
  days_31_90: "secondary",
  days_over_90: "destructive",
} as const satisfies Record<
  PartnerSaldoView["aging"],
  "outline" | "secondary" | "destructive"
>

export async function PartnerSaldoTable({
  rows,
}: {
  rows: readonly PartnerSaldoView[]
}) {
  const t = await getBetaTranslations()

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("finance.columnPartner")}</TableHead>
          <TableHead>{t("finance.columnIco")}</TableHead>
          <TableHead>{t("finance.columnRole")}</TableHead>
          <TableHead className="text-right">
            {t("finance.columnReceivable")}
          </TableHead>
          <TableHead className="text-right">
            {t("finance.columnPayable")}
          </TableHead>
          <TableHead>{t("finance.columnOldestDue")}</TableHead>
          <TableHead>{t("finance.columnAging")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium">{row.partnerName}</TableCell>
            <TableCell className="text-muted-foreground tabular-nums">
              {row.partnerIco ?? "—"}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {t(PARTNER_ROLE_LABEL_KEY[row.partnerRole])}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatAmount(row.receivableTotal) ?? "—"}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatAmount(row.payableTotal) ?? "—"}
            </TableCell>
            <TableCell className="tabular-nums">
              {formatDate(row.oldestDue) ?? "—"}
            </TableCell>
            <TableCell>
              <Badge variant={AGING_VARIANT[row.aging]}>
                {t(PARTNER_AGING_LABEL_KEY[row.aging])}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
