"use client"

import * as React from "react"

import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"

import { useBetaTranslations } from "@/i18n/translations"

import { createMonthlySetAction } from "../../_actions/client-tasks"
import { MONTHLY_SET_ACTION_IDLE } from "../../_actions/state"

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const

/**
 * "Vytvořit měsíční sadu úkolů" (spec §3.4) — a period picker (month + year)
 * that instantiates every active template into a dated task for that month.
 *
 * STAYS OPEN ON SUCCESS, unlike the `OfficeActionForm`-based sections beside
 * it. The whole point of `createMonthlyTaskSet`'s counts (spec §3.4's
 * idempotency: a second click for the same month must visibly do nothing) is
 * that the office SEES "Vytvořeno 0 · Již existovalo 6" rather than the
 * dialog just closing as if it had run for the first time again — which is
 * also why this has its OWN `useActionState` rather than reusing
 * `OfficeActionForm`: that component's state shape has no room for the two
 * counts (`state.ts`'s own header on `MonthlySetActionState`).
 */
export function MonthlySetDialog({ orgSlug }: { orgSlug: string }) {
  const t = useBetaTranslations()
  const [open, setOpen] = React.useState(false)
  const [state, formAction, pending] = React.useActionState(
    createMonthlySetAction,
    MONTHLY_SET_ACTION_IDLE,
  )

  const now = new Date()

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {t("ukoly.monthlySetButton")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("ukoly.monthlySetTitle")}</DialogTitle>
          <DialogDescription>
            {t("ukoly.monthlySetDescription")}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="orgSlug" value={orgSlug} />

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="monthly-set-month">{t("ukoly.fieldMonth")}</Label>
              <NativeSelect
                id="monthly-set-month"
                name="month"
                defaultValue={String(now.getMonth() + 1)}
              >
                {MONTHS.map((month) => (
                  <NativeSelectOption key={month} value={String(month)}>
                    {month}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="monthly-set-year">{t("ukoly.fieldYear")}</Label>
              <Input
                id="monthly-set-year"
                name="year"
                type="number"
                min={2000}
                max={2100}
                defaultValue={now.getFullYear()}
              />
            </div>
          </div>

          {state.status === "error" ? (
            <Alert variant="destructive">
              <AlertDescription>{t(state.error)}</AlertDescription>
            </Alert>
          ) : null}
          {state.status === "ok" ? (
            <Alert>
              <AlertDescription>
                {t("ukoly.monthlySetResultCreated")} {state.created}
                {" · "}
                {t("ukoly.monthlySetResultExisting")} {state.alreadyExisted}
              </AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? t("zadavani.pending") : t("ukoly.monthlySetSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
