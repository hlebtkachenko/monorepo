"use client"

import * as React from "react"

import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"

import { useBetaTranslations } from "@/i18n/translations"

import { deleteStatementLineRowAction } from "../../_actions/uzaverka"
import { START_MANUAL_BATCH_IDLE } from "../../_actions/uzaverka-state"

/**
 * "Smazat" for one výkaz row (manual-entry plan §3, W5) — mirrors
 * `PartnerSaldoRowDeleteForm`'s own reasoning verbatim: a plain inline
 * submit, NO confirmation dialog, because a row inside a DRAFT is nothing a
 * client has ever seen — removing it costs the same as fixing a typo, not
 * "Zveřejnit"'s irreversible publish.
 *
 * ITS OWN SMALL FORM, not `EntrySheet`: a delete carries no fields to edit.
 */
export function StatementRowDeleteForm({
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
    deleteStatementLineRowAction,
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
          : t("vykazyZadani.statementRowDeleteTrigger")}
      </Button>
      {state.status === "error" ? (
        <Alert variant="destructive">
          <AlertDescription>{t(state.error)}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  )
}
