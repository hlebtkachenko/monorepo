"use client"

import * as React from "react"

import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

import { useBetaTranslations } from "@/i18n/translations"

import { IssuedInviteLink } from "../../../../../_components/issued-invite-link"
import { inviteEmployeeSeatAction } from "../../_actions/employee-seat"
import { MZDY_ACTION_IDLE } from "../../_actions/state"

/**
 * "Pozvat do portálu" for one employee row (spec §2.6.1: "invite from employee
 * row").
 *
 * ONE FORM PER EMPLOYEE, inside their own row, rather than one form at the
 * bottom of the page with an employee picker. The binding this issues decides
 * whose payslips the resulting account reads, and a picker is the control that
 * makes picking the wrong person a one-key mistake — a select whose options are
 * a list of colleagues' names, several of whom may be called Jan Novák
 * (`payroll.ts` makes exactly that argument about name matching). The row is the
 * unambiguous statement of who is meant, and `employeeId` travels as a hidden
 * field that the server re-resolves against its own tenant filter.
 *
 * IT RENDERS ONLY WHERE THE SERVER SAID IT MAY. The page decides, from
 * `hasPortalAccount` and the viewer's own role, whether this component exists at
 * all — and the action re-derives every verdict from scratch anyway, because a
 * form control is a suggestion to a browser and never a constraint on a POST.
 *
 * `useActionState`, so the pending state is the framework's and the control
 * still works without client JavaScript.
 */
export function EmployeeSeatInvite({
  orgSlug,
  employeeId,
  employeeName,
}: Readonly<{
  orgSlug: string
  employeeId: string
  employeeName: string
}>) {
  const t = useBetaTranslations()
  const [state, formAction, pending] = React.useActionState(
    inviteEmployeeSeatAction,
    MZDY_ACTION_IDLE,
  )
  const fieldId = `seat-email-${employeeId}`

  return (
    <form action={formAction} className="grid gap-2">
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="employeeId" value={employeeId} />

      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <Label htmlFor={fieldId} className="text-xs">
            {/* Names the person, so an admin filling several rows in one sitting
                cannot lose track of which one this address is for. Composed
                here rather than through an ICU placeholder because beta's typed
                accessor (`useBetaTranslations`) takes a key and no values —
                widening it for one label would weaken the key checking that is
                the whole reason the wrapper exists. */}
            {`${t("mzdy.seatInviteEmailLabel")} — ${employeeName}`}
          </Label>
          <Input
            id={fieldId}
            name="email"
            type="email"
            required
            autoComplete="off"
            className="h-8 w-56"
          />
        </div>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? t("mzdy.pending") : t("mzdy.seatInviteSubmit")}
        </Button>
      </div>

      {state.status === "error" ? (
        <Alert variant="destructive">
          <AlertDescription>{t(state.error)}</AlertDescription>
        </Alert>
      ) : null}

      {state.status === "issued" ? (
        <IssuedInviteLink
          url={state.url}
          email={state.email}
          expiresAt={state.expiresAt}
        />
      ) : null}
    </form>
  )
}
