"use client"

import * as React from "react"

import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { useBetaTranslations } from "@/i18n/translations"

import {
  PRO_UCETNI_ACTION_IDLE,
  type ProUcetniActionState,
} from "../_actions/state"

/**
 * The one form every Zadávání dat write goes through — the org-tier twin of
 * `app/admin/_components/admin-action-form.tsx`.
 *
 * All six actions share `ProUcetniActionState`, so one component renders the
 * outcome of a create, a save, a mark-paid and a delete without any of them
 * growing its own status handling.
 *
 * `useActionState` (not a hand-rolled `onSubmit`), for the same two reasons the
 * admin form gives: the pending state is the framework's, and the form still
 * submits without client JavaScript because the fields are real form controls
 * and the action is a real POST target.
 *
 * `orgSlug` is rendered as a hidden field by this component rather than by each
 * caller, because every action reads it as the FIRST thing it does — that field
 * is what `requireOwner(await requireScope(orgSlug))` resolves, and a form that
 * forgot it would be an action that 404s for a reason nobody could see.
 */
export function OfficeActionForm({
  action,
  orgSlug,
  submitLabel,
  submitVariant = "default",
  className,
  layout = "stack",
  children,
}: Readonly<{
  action: (
    previous: ProUcetniActionState,
    formData: FormData,
  ) => Promise<ProUcetniActionState>
  orgSlug: string
  submitLabel: string
  submitVariant?: React.ComponentProps<typeof Button>["variant"]
  className?: string
  /** `row` for the inline, few-control forms inside a table row. */
  layout?: "stack" | "row"
  children?: React.ReactNode
}>) {
  const t = useBetaTranslations()
  const [state, formAction, pending] = React.useActionState(
    action,
    PRO_UCETNI_ACTION_IDLE,
  )

  return (
    <form
      action={formAction}
      className={cn(
        layout === "row" ? "flex flex-wrap items-end gap-2" : "grid gap-3",
        className,
      )}
    >
      <input type="hidden" name="orgSlug" value={orgSlug} />
      {children}

      <Button
        type="submit"
        size="sm"
        variant={submitVariant}
        disabled={pending}
        className={layout === "stack" ? "justify-self-start" : undefined}
      >
        {pending ? t("zadavani.pending") : submitLabel}
      </Button>

      {state.status === "error" ? (
        <Alert variant="destructive" className="col-span-full w-full">
          <AlertDescription>{t(state.error)}</AlertDescription>
        </Alert>
      ) : null}

      {state.status === "ok" ? (
        <Alert className="col-span-full w-full">
          <AlertDescription>{t(state.message)}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  )
}
