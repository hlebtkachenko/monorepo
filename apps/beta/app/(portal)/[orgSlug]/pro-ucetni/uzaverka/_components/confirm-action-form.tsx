"use client"

import * as React from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"

import { useBetaTranslations } from "@/i18n/translations"
import type { BetaMessageKey } from "@/i18n/messages"

import {
  UZAVERKA_ACTION_IDLE,
  type UzaverkaActionState,
} from "../../_actions/uzaverka-state"

/**
 * A Měsíční uzávěrka write behind a confirmation — publish, rollback, discard.
 *
 * WHY THESE THREE GET A DIALOG WHEN NOTHING ELSE IN THIS APP DOES. Every other
 * office write edits one row that the office can edit back. These three change
 * WHAT THE CLIENT'S ROZVAHA IS, instantly and for everyone: a publish replaces
 * the live statement, a rollback can leave a dataset with no published batch at
 * all (`rollbackDataset`'s own header), and a discard destroys parsed rows. The
 * dialog names the consequence in the sentence, so the office reads what it is
 * about to do rather than what the button is called.
 *
 * THE FORM AND THE DIALOG ARE SEPARATE ELEMENTS, JOINED BY `form=`. Radix
 * portals the dialog content out of the DOM subtree, so a submit button inside
 * `AlertDialogContent` is not a descendant of the `<form>` — the `form`
 * attribute (a plain HTML association, not a React trick) is what re-attaches
 * it. Putting the form inside the content instead would work until the dialog
 * unmounted mid-submit.
 *
 * THE COST, STATED: unlike `OfficeActionForm`, this one needs JavaScript — a
 * dialog trigger does nothing without it. Accepted here and nowhere else,
 * because these are exactly the writes that should not happen on an accidental
 * click, and a no-JS office can still reach every one of them through the
 * agent API (spec §3.2) which is the primary channel anyway.
 */
export function ConfirmActionForm({
  action,
  orgSlug,
  fields,
  triggerLabelKey,
  titleKey,
  descriptionKey,
  confirmLabelKey,
  variant = "default",
  disabled = false,
}: Readonly<{
  action: (
    previous: UzaverkaActionState,
    formData: FormData,
  ) => Promise<UzaverkaActionState>
  orgSlug: string
  /** The hidden inputs this write needs — batch id, or period + dataset. */
  fields: Readonly<Record<string, string>>
  triggerLabelKey: BetaMessageKey
  titleKey: BetaMessageKey
  descriptionKey: BetaMessageKey
  confirmLabelKey: BetaMessageKey
  variant?: React.ComponentProps<typeof Button>["variant"]
  disabled?: boolean
}>) {
  const t = useBetaTranslations()
  const formId = React.useId()
  const [state, formAction, pending] = React.useActionState(
    action,
    UZAVERKA_ACTION_IDLE,
  )

  return (
    <div className="grid gap-2">
      <form id={formId} action={formAction}>
        <input type="hidden" name="orgSlug" value={orgSlug} />
        {Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      </form>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant={variant} size="sm" disabled={disabled || pending}>
            {pending ? t("uzaverka.pending") : t(triggerLabelKey)}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(titleKey)}</AlertDialogTitle>
            <AlertDialogDescription>{t(descriptionKey)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("uzaverka.cancel")}</AlertDialogCancel>
            <AlertDialogAction type="submit" form={formId} variant={variant}>
              {t(confirmLabelKey)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {state.status === "error" ? (
        <Alert variant="destructive">
          <AlertDescription>{t(state.error)}</AlertDescription>
        </Alert>
      ) : null}

      {state.status === "ok" ? (
        <Alert>
          <AlertDescription>{t(state.message)}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}
