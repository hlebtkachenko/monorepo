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
  PayrollEmployeeLineView,
  PayrollEmployeeView,
} from "@/lib/data/projections"
import { formatBetaMoney } from "@/lib/format/money"

import { EntrySheet } from "../../../_components/entry-sheet"
import {
  deletePayrollLineAction,
  updatePayrollLineAction,
} from "../../_actions/uzaverka"
import { START_MANUAL_BATCH_IDLE } from "../../_actions/uzaverka-state"

import { ConfirmActionForm } from "./confirm-action-form"
import { PayrollLineFields } from "./payroll-line-fields"

/**
 * The payroll arm of the batch preview (manual-entry plan §3, W4) —
 * employee · hrubá · srážky · čistá · náklad, in the order `EmployeeFields`'
 * own Zaměstnanci columns already use, plus each row's own edit/delete when
 * the batch is still a draft.
 *
 * OFFICE-ONLY, same reasoning `PartnerSaldoBatchTable` states for its own
 * saldokonto arm: nothing here is what a client sees — Zaměstnanci and Moje
 * mzda read the PUBLISHED batch through `payroll.ts`'s own scoped queries,
 * never this component.
 *
 * `editable` IS THE CALLER'S OWN `batch.status === "draft"` TEST, passed down
 * rather than re-derived here — the same "state decides which action renders"
 * rule `uzaverka/[batchId]/page.tsx`'s own publish/discard/rollback trio
 * already follows for the batch as a whole, now applied per row.
 */
export async function PayrollBatchLinesTable({
  orgSlug,
  batchId,
  lines,
  employees,
  editable,
}: {
  orgSlug: string
  batchId: string
  lines: readonly PayrollEmployeeLineView[]
  employees: readonly PayrollEmployeeView[]
  editable: boolean
}) {
  const t = await getBetaTranslations()

  if (lines.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("mzdyZadani.batchLinesEmpty")}
      </p>
    )
  }

  const money = (value: string | null) =>
    formatBetaMoney(value) ?? <span className="text-muted-foreground">—</span>

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("mzdyZadani.columnEmployee")}</TableHead>
          <TableHead className="text-right">
            {t("mzdyZadani.columnGross")}
          </TableHead>
          <TableHead className="text-right">
            {t("mzdyZadani.columnDeductions")}
          </TableHead>
          <TableHead className="text-right">
            {t("mzdyZadani.columnNet")}
          </TableHead>
          <TableHead className="text-right">
            {t("mzdyZadani.columnCost")}
          </TableHead>
          {editable ? (
            <TableHead className="text-right">
              {t("mzdyZadani.columnActions")}
            </TableHead>
          ) : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((line) => (
          <TableRow key={line.id}>
            <TableCell className="font-medium">{line.employeeName}</TableCell>
            <TableCell className="text-right tabular-nums">
              {money(line.gross)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {money(line.deductionsTotal)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {money(line.net)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {money(line.employerCost)}
            </TableCell>
            {editable ? (
              <TableCell className="flex flex-wrap justify-end gap-2">
                <EntrySheet
                  action={updatePayrollLineAction}
                  idle={START_MANUAL_BATCH_IDLE}
                  hidden={{ orgSlug, batchId, lineId: line.id }}
                  triggerLabel={t("mzdyZadani.editLineTrigger")}
                  title={t("mzdyZadani.editLineTitle")}
                  description={t("mzdyZadani.editLineDescription")}
                  submitLabel={t("mzdyZadani.editLineSubmit")}
                >
                  <PayrollLineFields
                    t={t}
                    idPrefix={`payroll-line-${line.id}`}
                    employees={employees}
                    line={line}
                  />
                </EntrySheet>
                <ConfirmActionForm
                  action={deletePayrollLineAction}
                  orgSlug={orgSlug}
                  fields={{ batchId, lineId: line.id }}
                  triggerLabelKey="mzdyZadani.deleteLineTrigger"
                  titleKey="mzdyZadani.deleteLineTitle"
                  descriptionKey="mzdyZadani.deleteLineDescription"
                  confirmLabelKey="mzdyZadani.deleteLineConfirm"
                  variant="destructive"
                />
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
