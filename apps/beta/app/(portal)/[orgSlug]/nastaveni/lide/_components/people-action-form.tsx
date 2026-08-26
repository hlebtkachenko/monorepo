"use client"

import * as React from "react"

import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { useBetaTranslations } from "@/i18n/translations"

import { IssuedInviteLink } from "../../../../../_components/issued-invite-link"
import {
  NASTAVENI_ACTION_IDLE,
  type NastaveniActionState,
} from "../../_actions/state"

/**
 * The one form every Lidé write goes through — the same shape as
 * `OfficeActionForm` and `AdminActionForm`, over `NastaveniActionState`.
 *
 * Lidé's three actions (invite, change role, deactivate) are genuinely the same
 * shape, which is why this section gets a wrapper where the Společnost/Účet
 * forms deliberately did not (`_actions/state.ts` explains that split): a wide
 * identity card and an ARES suggestion list have nothing in common, three
 * one-control membership forms have everything.
 *
 * `orgSlug` is rendered as a hidden field HERE rather than by each caller. Every
 * action reads it as its first statement — it is what `requireScope(orgSlug)`
 * resolves, i.e. the entire tenancy gate — so a form that forgot it would be an
 * action that 404s for a reason nobody could see from the markup.
 *
 * `useActionState` rather than a hand-rolled `onSubmit`, so the pending state is
 * the framework's and every control still works without client JavaScript.
 */
export function PeopleActionForm({
  action,
  orgSlug,
  submitLabel,
  submitVariant = "default",
  submitDisabled = false,
  className,
  layout = "stack",
  children,
}: Readonly<{
  action: (
    previous: NastaveniActionState,
    formData: FormData,
  ) => Promise<NastaveniActionState>
  orgSlug: string
  submitLabel: string
  submitVariant?: React.ComponentProps<typeof Button>["variant"]
  /**
   * The last-owner and ceiling cases (spec §2.10: "last-owner protection
   * surfaced"). It is an EXPLANATION, not a gate — the server re-derives the
   * same verdict and the database refuses underneath it, so a disabled attribute
   * removed in devtools buys nothing.
   */
  submitDisabled?: boolean
  className?: string
  /** `row` for the inline, one-control forms inside a table row. */
  layout?: "stack" | "row"
  children?: React.ReactNode
}>) {
  const t = useBetaTranslations()
  const [state, formAction, pending] = React.useActionState(
    action,
    NASTAVENI_ACTION_IDLE,
  )

  return (
    <form
      action={formAction}
      className={cn(
        layout === "row" ? "flex flex-wrap items-center gap-2" : "grid gap-3",
        className,
      )}
    >
      <input type="hidden" name="orgSlug" value={orgSlug} />
      {children}

      <Button
        type="submit"
        size="sm"
        variant={submitVariant}
        disabled={pending || submitDisabled}
        className={layout === "stack" ? "justify-self-start" : undefined}
      >
        {pending ? t("nastaveni.pending") : submitLabel}
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
          <IssuedInviteLink
            url={state.url}
            email={state.email}
            expiresAt={state.expiresAt}
          />
        </div>
      ) : null}
    </form>
  )
}
