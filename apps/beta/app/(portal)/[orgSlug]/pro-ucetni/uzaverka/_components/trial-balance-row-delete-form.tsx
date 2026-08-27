"use client"

import * as React from "react"

import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"

import { useBetaTranslations } from "@/i18n/translations"

import { deleteTrialBalanceLineRowAction } from "../../_actions/uzaverka"
import { START_MANUAL_BATCH_IDLE } from "../../_actions/uzaverka-state"

/**
 * "Smazat" for one předvaha account row (manual-entry plan §3, W5) — mirrors
 * `PartnerSaldoRowDeleteForm` / `StatementRowDeleteForm`: a plain inline
 * submit, no confirmation, since a row inside a DRAFT is nothing a client
 * has ever seen.
 */
export function TrialBalanceRowDeleteForm({
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
    deleteTrialBalanceLineRowAction,
    START_MANUAL_BATCH_IDLE,
  )

  return (
    <form action={formAction} className="grid gap-1">
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="batchId" value={batchId} />
      <input type="hidden" name="rowId" value={rowId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending
          ? t("uzaverka.pending")
          : t("vykazyZadani.predvahaRowDeleteTrigger")}
      </Button>
      {state.status === "error" ? (
        <Alert variant="destructive">
          <AlertDescription>{t(state.error)}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  )
}
