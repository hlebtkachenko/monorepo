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
import type { PartnerSaldoLineView, PartnerView } from "@/lib/data/projections"

import {
  addPartnerSaldoRowAction,
  updatePartnerSaldoRowAction,
} from "../../_actions/uzaverka"
import { START_MANUAL_BATCH_IDLE } from "../../_actions/uzaverka-state"
import { EntrySheet } from "../../../_components/entry-sheet"

import { PartnerSaldoRowDeleteForm } from "./partner-saldo-row-delete-form"
import { SaldoRowFields } from "./saldo-row-fields"

/**
 * The saldokonto arm of the batch preview (manual-entry plan §3, W1 + W2) —
 * partner · dlužné nám · dlužíme · nejstarší splatnost, in printed order, plus
 * the row drawer (W2): an "Přidat partnera" `EntrySheet` above the table and,
 * per row, an "Upravit" one and a "Smazat" — all THREE gated on `isDraft`,
 * never rendered for a published or superseded batch.
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
 *
 * `isDraft` IS THE ONLY GATE THIS COMPONENT NEEDS, not a second read of the
 * batch's status: `[batchId]/page.tsx` already resolved `officeBatchFor` once
 * and this table is OWNER-ONLY BY CONSTRUCTION (that page never renders it for
 * anyone else), so a boolean prop is enough — the write actions underneath
 * still call `requireOwner(await requireScope(orgSlug))` themselves regardless
 * of what this component renders.
 */
export async function PartnerSaldoBatchTable({
  lines,
  orgSlug,
  batchId,
  isDraft,
  partners,
}: {
  lines: readonly PartnerSaldoLineView[]
  orgSlug: string
  batchId: string
  isDraft: boolean
  partners: readonly PartnerView[]
}) {
  const t = await getBetaTranslations()

  const addRow = isDraft ? (
    <EntrySheet
      action={addPartnerSaldoRowAction}
      idle={START_MANUAL_BATCH_IDLE}
      hidden={{ orgSlug, batchId }}
      triggerLabel={t("uzaverka.saldoRowAddTrigger")}
      title={t("uzaverka.saldoRowAddTitle")}
      description={t("uzaverka.saldoRowAddDescription")}
      submitLabel={t("uzaverka.saldoRowAddSubmit")}
    >
      <SaldoRowFields t={t} idPrefix="new-saldo-row" partners={partners} />
    </EntrySheet>
  ) : null

  if (lines.length === 0) {
    return (
      <div className="grid gap-3">
        {addRow}
        <p className="text-sm text-muted-foreground">
          {t("uzaverka.saldokontoBatchEmpty")}
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      {addRow}
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
            {isDraft ? (
              <TableHead>{t("uzaverka.columnActions")}</TableHead>
            ) : null}
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
              {isDraft ? (
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <EntrySheet
                      action={updatePartnerSaldoRowAction}
                      idle={START_MANUAL_BATCH_IDLE}
                      hidden={{ orgSlug, batchId, rowId: line.id }}
                      triggerLabel={t("uzaverka.saldoRowEditTrigger")}
                      title={t("uzaverka.saldoRowEditTitle")}
                      description={t("uzaverka.saldoRowEditDescription")}
                      submitLabel={t("uzaverka.saldoRowEditSubmit")}
                    >
                      <SaldoRowFields
                        t={t}
                        idPrefix={`saldo-row-${line.id}`}
                        partners={partners}
                        line={line}
                      />
                    </EntrySheet>
                    <PartnerSaldoRowDeleteForm
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
