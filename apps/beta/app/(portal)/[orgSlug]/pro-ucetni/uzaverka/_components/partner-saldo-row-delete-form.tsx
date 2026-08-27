"use client"

import * as React from "react"

import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"

import { useBetaTranslations } from "@/i18n/translations"

import { deletePartnerSaldoRowAction } from "../../_actions/uzaverka"
import { START_MANUAL_BATCH_IDLE } from "../../_actions/uzaverka-state"

/**
 * "Smazat" for one saldokonto row (manual-entry plan §3, W2) — a plain inline
 * submit, NO confirmation dialog. Mirrors `deleteLiabilityAction`'s own
 * row-level delete in `zadavani/_components/liabilities-section.tsx`, not
 * `ConfirmActionForm`'s batch-level one: a saldo row is one partner's figure
 * inside a DRAFT the office is still assembling — nothing a client has ever
 * seen — so removing it costs the same as fixing a typo, not "Zveřejnit"'s
 * irreversible publish.
 *
 * ITS OWN SMALL FORM, not `EntrySheet`: a delete carries no fields to edit, so
 * the Sheet's whole apparatus (a trigger that opens a panel) would be
 * overhead for one button.
 */
export function PartnerSaldoRowDeleteForm({
  orgSlug,
  batchId,
  rowId,
}: {
  orgSlug: string
  batchId: string
  rowId: string
}) {
  const t = useBetaTranslations()
  const [state, formAction, pending] = React.useActionState(
    deletePartnerSaldoRowAction,
    START_MANUAL_BATCH_IDLE,
  )

  return (
    <form action={formAction} className="grid gap-1">
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="batchId" value={batchId} />
      <input type="hidden" name="rowId" value={rowId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? t("uzaverka.pending") : t("uzaverka.saldoRowDeleteTrigger")}
      </Button>
      {state.status === "error" ? (
        <Alert variant="destructive">
          <AlertDescription>{t(state.error)}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  )
}
