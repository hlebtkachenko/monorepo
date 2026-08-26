import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { cn } from "@workspace/ui/lib/utils"

import { getBetaTranslations } from "@/i18n/translations-server"
import type { BetaMessageKey } from "@/i18n/messages"
import type { BetaStatementKind } from "@/db/schema"
import { formatBetaAmount } from "@/lib/format/money"
import type { StatementLineView } from "@/lib/data/projections"

/**
 * One statutory statement, rendered as the office published it (spec §2.5).
 *
 * SHARED (`app/_components/`) RATHER THAN OWNED BY Výkazy, because two route
 * trees render it: the client statements under `[orgSlug]/vykazy`, and the
 * office's batch preview under `[orgSlug]/pro-ucetni/uzaverka/[batchId]`. That
 * is not incidental — the preview exists so the office sees EXACTLY what the
 * client will see before publishing, and two implementations of "exactly" is
 * one too many.
 *
 * THE COLUMN SET IS A FUNCTION OF THE STATEMENT KIND, and it is the same
 * function `statement_line_column_shape` enforces in the database and the
 * repo's own `ColKey` union declares (`apps/web/app/vykazy/_lib/types.ts`):
 *
 *   rozvaha aktiva → brutto · korekce · netto · minulé   (four columns)
 *   rozvaha pasiva → běžné · minulé                      (two)
 *   VZZ            → běžné · minulé                      (two)
 *
 * Rendering a pasiva with a korekce column would be printing a column the form
 * does not have; rendering an aktiva without korekce would hide the oprávky.
 * Both are prevented here by reading the column list off the kind rather than
 * by passing it in.
 *
 * NOTHING IS COMPUTED, INCLUDING THE TOTALS. `netto` is displayed as stored —
 * it is arithmetically brutto − korekce and is nonetheless taken as given
 * (spec §0.2, and `statement_line`'s own schema comment). There is no footer
 * row: a Czech rozvaha's totals ARE řádky of the form (AKTIVA CELKEM is line
 * 001, printed bold), so they arrive as ordinary rows and a computed footer
 * would be this application inventing a number next to the office's own.
 *
 * HIERARCHY COMES FROM THE ROW, NOT FROM THE LABEL. `indent` and `isBold` are
 * published per line, so a form whose wording changes still renders with the
 * shape the office sent — nothing here parses `ozn` to guess a depth.
 *
 * A NULL CELL RENDERS AS AN ABSENCE. The rozvaha prints "x" in the korekce
 * column of many lines and leaves other cells blank; §0.4's "empty beats
 * stale" applies at cell granularity, so an unstated value is a dash and never
 * `0,00`.
 */

type ValueColumn = "brutto" | "korekce" | "netto" | "bezne" | "minule"

const VALUE_COLUMNS = {
  rozvaha_aktiva: ["brutto", "korekce", "netto", "minule"],
  rozvaha_pasiva: ["bezne", "minule"],
  vzz: ["bezne", "minule"],
} as const satisfies Record<BetaStatementKind, readonly ValueColumn[]>

const COLUMN_LABEL_KEY = {
  brutto: "vykazy.columnBrutto",
  korekce: "vykazy.columnKorekce",
  netto: "vykazy.columnNetto",
  bezne: "vykazy.columnBezne",
  minule: "vykazy.columnMinule",
} as const satisfies Record<ValueColumn, BetaMessageKey>

/** Tailwind cannot see a computed class name, so the depths are written out. */
const INDENT_CLASS = [
  "pl-0",
  "pl-3",
  "pl-6",
  "pl-9",
  "pl-12",
  "pl-15",
  "pl-18",
  "pl-21",
  "pl-24",
] as const

export async function StatementTable({
  kind,
  captionKey,
  lines,
}: {
  kind: BetaStatementKind
  captionKey: BetaMessageKey
  lines: readonly StatementLineView[]
}) {
  const t = await getBetaTranslations()
  const columns = VALUE_COLUMNS[kind]

  return (
    <Table>
      <TableCaption className="text-left">
        {t(captionKey)} · {t("vykazy.unitCzk")}
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead className="w-20">{t("vykazy.columnOzn")}</TableHead>
          <TableHead className="w-16">{t("vykazy.columnRowCode")}</TableHead>
          <TableHead>{t("vykazy.columnText")}</TableHead>
          {columns.map((column) => (
            <TableHead key={column} className="text-right">
              {t(COLUMN_LABEL_KEY[column])}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((line) => (
          <TableRow
            key={line.id}
            className={cn(line.isBold && "font-semibold")}
          >
            <TableCell className="text-muted-foreground">
              {line.ozn ?? ""}
            </TableCell>
            <TableCell className="text-muted-foreground tabular-nums">
              {line.rowCode}
            </TableCell>
            <TableCell className={INDENT_CLASS[line.indent] ?? INDENT_CLASS[0]}>
              {line.rowLabel}
            </TableCell>
            {columns.map((column) => {
              const formatted = formatBetaAmount(line[column])
              return (
                <TableCell key={column} className="text-right tabular-nums">
                  {formatted ?? (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              )
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
