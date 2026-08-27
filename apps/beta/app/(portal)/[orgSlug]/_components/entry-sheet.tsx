"use client"

import * as React from "react"

import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet"

import { useBetaTranslations } from "@/i18n/translations"
import type { BetaMessageKey } from "@/i18n/messages"

import { usePreserveFormValues } from "../_lib/preserve-form-values"

/**
 * The state shape every manual-entry action must return — the common subset
 * of every module's own `<Module>ActionState` (`UveryActionState`,
 * `ProUcetniActionState`, `UzaverkaActionState`, …: idle / ok+message /
 * error+error). `EntrySheet` is generic over `S` rather than importing a
 * concrete module type, so a module's own state — which structurally matches
 * this shape today — slots in with no change to its `_actions/state.ts`.
 */
export type EntrySheetActionState =
  | { status: "idle" }
  | { status: "ok"; message: BetaMessageKey }
  | { status: "error"; error: BetaMessageKey }

export type EntrySheetAction<S extends EntrySheetActionState> = (
  previous: S,
  formData: FormData,
) => Promise<S>

/**
 * The shared manual-entry primitive (plan §2.1) — the Sheet every
 * "ingestion-only, needs a form" write in the manual-entry program opens
 * through. This PR (W0) both builds it and converts the first caller
 * (Úvěry create, `finance/uvery/page.tsx`) to prove the shape end to end
 * before the later waves each add their own.
 *
 * Built from primitives already load-bearing elsewhere in this app —
 * `Sheet` (already used by `pro-ucetni/_components/document-sheet.tsx`) —
 * plus the render-time close-on-success idiom copied verbatim from
 * `document-sheet.tsx:70-74`: state is compared to the PREVIOUS render's
 * state during render, not inside a `useEffect`, which is React's own
 * recommended shape for "close when a value just changed" and avoids the
 * extra render pass an effect would cost.
 *
 * THE COST, STATED ONCE, HERE: unlike the many existing `OfficeActionForm` /
 * `LoanActionForm`-based writes, a Sheet needs JavaScript to open at all.
 * Accepted for every NEW manual-entry surface — nothing regresses, since the
 * agent ingestion API remains the primary channel and every existing no-JS
 * form is untouched by this file (`uzaverka/_components/confirm-action-form.tsx:45-49`
 * states the same trade for its own, narrower case).
 *
 * `hidden` carries every hidden input the action needs as one object —
 * `orgSlug` always, plus a row or batch id where the action edits rather than
 * creates — rendered by THIS component rather than by each caller, for the
 * reason `OfficeActionForm:29-32` gives: the action reads `orgSlug` as the
 * FIRST thing it does, so a caller that forgot it would be a write that
 * 404s for a reason nobody could see.
 *
 * Closes on `status: "ok"`, never on `"error"` — the error `Alert` stays
 * inside the open sheet so the office can fix the field and resubmit.
 */
export function EntrySheet<S extends EntrySheetActionState>({
  action,
  idle,
  hidden,
  triggerLabel,
  triggerVariant = "outline",
  triggerSize = "sm",
  title,
  description,
  submitLabel,
  children,
}: Readonly<{
  action: EntrySheetAction<S>
  idle: S
  /** Every hidden input the action needs — `orgSlug` always. */
  hidden: Readonly<Record<string, string>>
  triggerLabel: string
  /** `outline`/`sm` for a row- or section-level trigger, `default` for the page header's primary "Zadat ručně". */
  triggerVariant?: React.ComponentProps<typeof Button>["variant"]
  triggerSize?: React.ComponentProps<typeof Button>["size"]
  title: string
  description: string
  submitLabel: string
  children: React.ReactNode
}>) {
  const t = useBetaTranslations()
  const [open, setOpen] = React.useState(false)
  const formRef = React.useRef<HTMLFormElement>(null)

  // `useActionState`'s declared signature wants `Awaited<S>`, which
  // TypeScript cannot reduce to `S` for an abstract, generic `S` — even
  // though every real `S` here is a plain, non-Promise union and the two
  // are identical at runtime. One narrow, local cast in each direction
  // (never `any`) is the accepted shape for this exact generic-library
  // mismatch; every other line in this file stays fully typed in `S`.
  const preservingAction = usePreserveFormValues(
    formRef,
    action as unknown as (
      previous: Awaited<S>,
      formData: FormData,
    ) => Awaited<S> | Promise<Awaited<S>>,
  )
  const [rawState, formAction, pending] = React.useActionState(
    preservingAction,
    idle as unknown as Awaited<S>,
  )
  const state = rawState as S

  // Close on a successful save — adjusted during render rather than in a
  // `useEffect`, exactly as `document-sheet.tsx:70-74` does.
  const [seenState, setSeenState] = React.useState(state)
  if (state !== seenState) {
    setSeenState(state)
    if (state.status === "ok") setOpen(false)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant={triggerVariant} size={triggerSize}>
          {triggerLabel}
        </Button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>

        <form ref={formRef} action={formAction} className="grid gap-4 px-4">
          {Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}

          {children}

          {state.status === "error" ? (
            <Alert variant="destructive">
              <AlertDescription>{t(state.error)}</AlertDescription>
            </Alert>
          ) : null}

          <SheetFooter className="flex-row justify-end gap-2 px-0">
            <SheetClose asChild>
              <Button type="button" variant="outline" size="sm">
                {t("entry.close")}
              </Button>
            </SheetClose>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? t("entry.pending") : submitLabel}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
