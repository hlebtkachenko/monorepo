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

import {
  addStatementLineRowAction,
  updateStatementLineRowAction,
} from "../../_actions/uzaverka"
import { START_MANUAL_BATCH_IDLE } from "../../_actions/uzaverka-state"
import { EntrySheet } from "../../../_components/entry-sheet"

import { StatementRowDeleteForm } from "./statement-row-delete-form"
import { StatementRowFields } from "./statement-row-fields"

/**
 * The rozvaha/VZZ arm of the batch preview (manual-entry plan §3, W5) — the
 * office's own `StatementTable` (kind-dependent column set), plus the row
 * drawer: an "Přidat řádek" `EntrySheet` above the table and, per row, an
 * "Upravit" one and a "Smazat" — all THREE gated on `isDraft`.
 *
 * OFFICE-ONLY, deliberately NOT the shared `app/_components/statement-table.tsx`
 * — same reasoning `PartnerSaldoBatchTable` states for its own build: that
 * component is shared with the CLIENT (`[orgSlug]/vykazy`), which must never
 * see an edit or delete control, so this file keeps its own copy of the
 * column-shape lookup rather than growing the shared, tested component an
 * office-only concern.
 *
 * `defaultSortOrder` FOR A NEW ROW is `lines.length + 1` — append at end
 * (plan §3, W5). For an EXISTING row it is the row's own POSITION in this
 * already-ordered array, not the literal stored `sort_order` (never
 * projected — see `StatementLineView`'s own comment) — an editable starting
 * point, consistent with the rest of this array being presentation order.
 */
export async function StatementBatchTable({
  kind,
  captionKey,
  lines,
  orgSlug,
  batchId,
  isDraft,
}: {
  kind: BetaStatementKind
  captionKey: BetaMessageKey
  lines: readonly StatementLineView[]
  orgSlug: string
  batchId: string
  isDraft: boolean
}) {
  const t = await getBetaTranslations()
  const columns = VALUE_COLUMNS[kind]

  const addRow = isDraft ? (
    <EntrySheet
      action={addStatementLineRowAction}
      idle={START_MANUAL_BATCH_IDLE}
      hidden={{ orgSlug, batchId, statementKind: kind }}
      triggerLabel={t("vykazyZadani.statementRowAddTrigger")}
      title={t("vykazyZadani.statementRowAddTitle")}
      description={t("vykazyZadani.statementRowAddDescription")}
      submitLabel={t("vykazyZadani.statementRowAddSubmit")}
    >
      <StatementRowFields
        t={t}
        idPrefix={`new-statement-row-${kind}`}
        kind={kind}
        defaultSortOrder={lines.length + 1}
      />
    </EntrySheet>
  ) : null

  if (lines.length === 0) {
    return (
      <div className="grid gap-3">
        {addRow}
        <p className="text-sm text-muted-foreground">
          {t("vykazyZadani.statementBatchEmpty")}
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      {addRow}
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
            {isDraft ? (
              <TableHead>{t("uzaverka.columnActions")}</TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line, index) => (
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
              <TableCell
                className={INDENT_CLASS[line.indent] ?? INDENT_CLASS[0]}
              >
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
              {isDraft ? (
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <EntrySheet
                      action={updateStatementLineRowAction}
                      idle={START_MANUAL_BATCH_IDLE}
                      hidden={{
                        orgSlug,
                        batchId,
                        rowId: line.id,
                        statementKind: kind,
                      }}
                      triggerLabel={t("vykazyZadani.statementRowEditTrigger")}
                      title={t("vykazyZadani.statementRowEditTitle")}
                      description={t(
                        "vykazyZadani.statementRowEditDescription",
                      )}
                      submitLabel={t("vykazyZadani.statementRowEditSubmit")}
                    >
                      <StatementRowFields
                        t={t}
                        idPrefix={`statement-row-${line.id}`}
                        kind={kind}
                        defaultSortOrder={index + 1}
                        line={line}
                      />
                    </EntrySheet>
                    <StatementRowDeleteForm
                      orgSlug={orgSlug}
                      batchId={batchId}
                      rowId={line.id}
                    />
                  </div>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/** Mirrors `app/_components/statement-table.tsx`'s own map — see that file for why. */
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
