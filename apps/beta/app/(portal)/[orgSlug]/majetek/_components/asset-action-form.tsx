"use client"

import * as React from "react"

import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { useBetaTranslations } from "@/i18n/translations"

import { usePreserveFormValues } from "../../_lib/preserve-form-values"
import { MAJETEK_ACTION_IDLE, type MajetekAction } from "../_actions/state"

/**
 * The one form every Majetek write goes through — the org-scoped twin of
 * `app/admin/_components/admin-action-form.tsx`.
 *
 * `useActionState`, not a hand-rolled `onSubmit`: the pending state is the
 * framework's, and the form still submits without JavaScript — its fields are
 * real form controls and the action is a real POST target.
 */
export function AssetActionForm({
  action,
  submitLabel,
  submitVariant = "default",
  className,
  layout = "stack",
  children,
}: Readonly<{
  action: MajetekAction
  submitLabel: string
  submitVariant?: React.ComponentProps<typeof Button>["variant"]
  className?: string
  /** `row` for the inline, one-control forms inside a table row. */
  layout?: "stack" | "row"
  children?: React.ReactNode
}>) {
  const t = useBetaTranslations()
  const formRef = React.useRef<HTMLFormElement>(null)
  const [state, formAction, pending] = React.useActionState(
    usePreserveFormValues(formRef, action),
    MAJETEK_ACTION_IDLE,
  )

  return (
    <form
      ref={formRef}
      action={formAction}
      className={cn(
        layout === "row" ? "flex flex-wrap items-center gap-2" : "grid gap-3",
        className,
      )}
    >
      {children}

      <Button
        type="submit"
        size="sm"
        variant={submitVariant}
        disabled={pending}
        className={layout === "stack" ? "justify-self-start" : undefined}
      >
        {pending ? t("majetek.pending") : submitLabel}
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
