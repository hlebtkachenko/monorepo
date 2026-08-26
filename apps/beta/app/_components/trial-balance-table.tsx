import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { getBetaTranslations } from "@/i18n/translations-server"
import type { TrialBalanceLineView } from "@/lib/data/projections"
import { formatBetaAmount } from "@/lib/format/money"

/**
 * An obratová předvaha: účet · název · počáteční stav · obraty MD/D · konečný
 * zůstatek (spec §2.5).
 *
 * SHARED for the same reason `StatementTable` is: the client reads it under
 * `[orgSlug]/vykazy/predvaha`, and the office previews the identical rows in a
 * draft batch before publishing it.
 *
 * ACCOUNT-KEYED, NOT FORM-KEYED, which is why it is not a `StatementTable`
 * variant: a předvaha has no označení, no indent and no order imposed by a
 * vyhláška — it has an account number, and the account number is its identity
 * (`trial_balance_line`'s own schema comment). The rows arrive ordered by
 * `account_code` from the data layer; nothing is re-sorted here.
 *
 * NO FOOTER SUM. A předvaha's totals are a real accounting check (Σ MD = Σ D),
 * and computing one here would be this portal asserting that the office's own
 * export balances — a claim it is not the authority on (spec §0.2). The
 * office's software prints that line; if it is wanted on screen it arrives as
 * a row like any other.
 *
 * A NULL CELL IS AN ABSENCE, never `0,00` — a předvaha may omit a column
 * entirely (§0.4).
 */
export async function TrialBalanceTable({
  lines,
}: {
  lines: readonly TrialBalanceLineView[]
}) {
  const t = await getBetaTranslations()

  return (
    <Table>
      <TableCaption className="text-left">
        {t("vykazy.captionPredvaha")} · {t("vykazy.unitCzk")}
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead className="w-24">
            {t("vykazy.columnAccountCode")}
          </TableHead>
          <TableHead>{t("vykazy.columnAccountName")}</TableHead>
          <TableHead className="text-right">
            {t("vykazy.columnOpeningBalance")}
          </TableHead>
          <TableHead className="text-right">
            {t("vykazy.columnTurnoverDebit")}
          </TableHead>
          <TableHead className="text-right">
            {t("vykazy.columnTurnoverCredit")}
          </TableHead>
          <TableHead className="text-right">
            {t("vykazy.columnClosingBalance")}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((line) => (
          <TableRow key={line.id}>
            <TableCell className="font-medium tabular-nums">
              {line.accountCode}
            </TableCell>
            <TableCell>{line.accountName}</TableCell>
            {[
              line.openingBalance,
              line.turnoverDebit,
              line.turnoverCredit,
              line.closingBalance,
            ].map((value, column) => (
              <TableCell key={column} className="text-right tabular-nums">
                {formatBetaAmount(value) ?? (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
