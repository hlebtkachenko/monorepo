"use client"

import * as React from "react"

import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { useBetaTranslations } from "@/i18n/translations"

import { usePreserveFormValues } from "../../../_lib/preserve-form-values"
import { UVERY_ACTION_IDLE, type UveryAction } from "../_actions/state"

/**
 * The one form every Úvěry write goes through — the twin of
 * `majetek/_components/asset-action-form.tsx`.
 *
 * `useActionState`, not a hand-rolled `onSubmit`: the pending state is the
 * framework's, and the form still submits without JavaScript — its fields are
 * real form controls and the action is a real POST target.
 */
export function LoanActionForm({
  action,
  submitLabel,
  className,
  children,
}: Readonly<{
  action: UveryAction
  submitLabel: string
  className?: string
  children?: React.ReactNode
}>) {
  const t = useBetaTranslations()
  const formRef = React.useRef<HTMLFormElement>(null)
  const [state, formAction, pending] = React.useActionState(
    usePreserveFormValues(formRef, action),
    UVERY_ACTION_IDLE,
  )

  return (
    <form
      ref={formRef}
      action={formAction}
      className={cn("grid gap-3", className)}
    >
      {children}

      <Button
        type="submit"
        size="sm"
        disabled={pending}
        className="justify-self-start"
      >
        {pending ? t("uvery.pending") : submitLabel}
      </Button>

      {state.status === "error" ? (
        <Alert variant="destructive" className="col-span-full">
          <AlertDescription>{t(state.error)}</AlertDescription>
        </Alert>
      ) : null}

      {state.status === "ok" ? (
        <Alert className="col-span-full">
          <AlertDescription>{t(state.message)}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  )
}
