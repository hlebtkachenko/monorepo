import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { formatBetaDate } from "@/lib/format/date"
import { formatBetaMoney } from "@/lib/format/money"
import { getBetaTranslations } from "@/i18n/translations-server"
import type { PartnerSaldoLineView } from "@/lib/data/projections"

/**
 * The saldokonto arm of the batch preview (manual-entry plan §3, W1) —
 * partner · dlužné nám · dlužíme · nejstarší splatnost, in printed order.
 *
 * OFFICE-ONLY, unlike `StatementTable` / `TrialBalanceTable` in
 * `app/_components/`. Those are shared with the CLIENT because a rozvaha or a
 * předvaha renders identically once published; a saldokonto batch preview has
 * no client-facing twin at all — `finance/pohledavky-a-zavazky` reads the
 * newest PUBLISHED batch through `saldokontoForScope`'s own aging-and-totals
 * query (`PartnerSaldoView`), which means something only for a live position.
 * A draft being reviewed, or a superseded batch read as history, has neither,
 * so this component takes the leaner `PartnerSaldoLineView` and renders
 * exactly what W1's plan asks for: the four stored fields, nothing computed.
 *
 * ORDERED BY THE DATA LAYER (`partnerSaldoLinesForBatch`'s own `ORDER BY
 * partner.name`), never re-sorted here — same rule `TrialBalanceTable` states
 * for its own `account_code` order.
 */
export async function PartnerSaldoBatchTable({
  lines,
}: {
  lines: readonly PartnerSaldoLineView[]
}) {
  const t = await getBetaTranslations()

  if (lines.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("uzaverka.saldokontoBatchEmpty")}
      </p>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("finance.columnPartner")}</TableHead>
          <TableHead className="text-right">
            {t("finance.columnReceivable")}
          </TableHead>
          <TableHead className="text-right">
            {t("finance.columnPayable")}
          </TableHead>
          <TableHead>{t("finance.columnOldestDue")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((line) => (
          <TableRow key={line.id}>
            <TableCell className="font-medium">{line.partnerName}</TableCell>
            <TableCell className="text-right tabular-nums">
              {formatBetaMoney(line.receivableTotal) ?? (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatBetaMoney(line.payableTotal) ?? (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell className="tabular-nums">
              {line.oldestDue === null ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                formatBetaDate(line.oldestDue)
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
