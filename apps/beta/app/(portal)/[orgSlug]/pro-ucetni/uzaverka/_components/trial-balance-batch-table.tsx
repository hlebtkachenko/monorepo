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

import {
  addTrialBalanceLineRowAction,
  updateTrialBalanceLineRowAction,
} from "../../_actions/uzaverka"
import { START_MANUAL_BATCH_IDLE } from "../../_actions/uzaverka-state"
import { EntrySheet } from "../../../_components/entry-sheet"

import { TrialBalanceRowDeleteForm } from "./trial-balance-row-delete-form"
import { TrialBalanceRowFields } from "./trial-balance-row-fields"

/**
 * The předvaha arm of the batch preview (manual-entry plan §3, W5) — the
 * office's own `TrialBalanceTable`, plus the row drawer: an "Přidat účet"
 * `EntrySheet` above the table and, per row, an "Upravit" one and a
 * "Smazat" — all THREE gated on `isDraft`.
 *
 * OFFICE-ONLY, deliberately NOT the shared `app/_components/trial-balance-table.tsx`
 * — same reasoning `StatementBatchTable` states for its own build.
 *
 * ORDERED BY THE DATA LAYER (`trialBalanceLinesForBatch`'s own
 * `ORDER BY account_code`), never re-sorted here — same rule the shared
 * table states for its own read.
 */
export async function TrialBalanceBatchTable({
  lines,
  orgSlug,
  batchId,
  isDraft,
}: {
  lines: readonly TrialBalanceLineView[]
  orgSlug: string
  batchId: string
  isDraft: boolean
}) {
  const t = await getBetaTranslations()

  const addRow = isDraft ? (
    <EntrySheet
      action={addTrialBalanceLineRowAction}
      idle={START_MANUAL_BATCH_IDLE}
      hidden={{ orgSlug, batchId }}
      triggerLabel={t("vykazyZadani.predvahaRowAddTrigger")}
      title={t("vykazyZadani.predvahaRowAddTitle")}
      description={t("vykazyZadani.predvahaRowAddDescription")}
      submitLabel={t("vykazyZadani.predvahaRowAddSubmit")}
    >
      <TrialBalanceRowFields t={t} idPrefix="new-predvaha-row" />
    </EntrySheet>
  ) : null

  if (lines.length === 0) {
    return (
      <div className="grid gap-3">
        {addRow}
        <p className="text-sm text-muted-foreground">
          {t("vykazyZadani.predvahaBatchEmpty")}
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      {addRow}
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
            {isDraft ? (
              <TableHead>{t("uzaverka.columnActions")}</TableHead>
            ) : null}
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
              {isDraft ? (
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <EntrySheet
                      action={updateTrialBalanceLineRowAction}
                      idle={START_MANUAL_BATCH_IDLE}
                      hidden={{ orgSlug, batchId, rowId: line.id }}
                      triggerLabel={t("vykazyZadani.predvahaRowEditTrigger")}
                      title={t("vykazyZadani.predvahaRowEditTitle")}
                      description={t("vykazyZadani.predvahaRowEditDescription")}
                      submitLabel={t("vykazyZadani.predvahaRowEditSubmit")}
                    >
                      <TrialBalanceRowFields
                        t={t}
                        idPrefix={`predvaha-row-${line.id}`}
                        line={line}
                      />
                    </EntrySheet>
                    <TrialBalanceRowDeleteForm
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
