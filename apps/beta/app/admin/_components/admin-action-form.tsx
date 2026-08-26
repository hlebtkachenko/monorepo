"use client"

import * as React from "react"

import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { useBetaTranslations } from "@/i18n/translations"

import { ADMIN_ACTION_IDLE, type AdminAction } from "../_actions/state"

import { IssuedLink } from "./issued-link"

/**
 * The one form every /admin write goes through.
 *
 * All actions share `AdminActionState`, so one component renders the outcome of
 * a create, a role change, an archive and a revoke — including the `issued`
 * case, which is the only one that has to render something the server will
 * never be able to produce again.
 *
 * `useActionState` (not a hand-rolled `onSubmit`) so the pending state is the
 * framework's and the form still submits without JavaScript: the fields are
 * real form controls and the action is a real POST target. That matters more
 * here than on a public page — /admin is the surface an operator reaches for
 * when something else is already broken.
 */
export function AdminActionForm({
  action,
  submitLabel,
  submitVariant = "default",
  className,
  layout = "stack",
  children,
}: Readonly<{
  action: AdminAction
  submitLabel: string
  submitVariant?: React.ComponentProps<typeof Button>["variant"]
  className?: string
  /** `row` for the inline, one-control forms inside a table row. */
  layout?: "stack" | "row"
  children?: React.ReactNode
}>) {
  const t = useBetaTranslations()
  const [state, formAction, pending] = React.useActionState(
    action,
    ADMIN_ACTION_IDLE,
  )

  return (
    <form
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
        {pending ? t("admin.pending") : submitLabel}
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

      {state.status === "issued" ? (
        <div className="col-span-full">
          <IssuedLink
            url={state.url}
            email={state.email}
            expiresAt={state.expiresAt}
          />
        </div>
      ) : null}
    </form>
  )
}
