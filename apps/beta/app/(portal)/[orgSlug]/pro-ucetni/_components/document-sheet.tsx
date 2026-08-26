"use client"

import * as React from "react"

import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet"
import { Textarea } from "@workspace/ui/components/textarea"

import { useBetaTranslations } from "@/i18n/translations"
import type { OwnerDocumentDetail } from "@/lib/data/projections"

import { saveDocumentOfficeAction } from "../_actions/documents"
import { PRO_UCETNI_ACTION_IDLE } from "../_actions/state"

import {
  DOC_TYPE_LABEL_KEY,
  DOC_TYPE_OPTIONS,
  STATUS_LABEL_KEY,
  STATUS_OPTIONS,
} from "./labels"

/**
 * The edit-mode document sheet (spec §3.1 — "the ONLY place document fields
 * are edited"). ONE form, opened from a table row, that always submits every
 * field at once — including `status`, so a status TRANSITION and an ordinary
 * field edit are the same save from the UI's point of view; the write layer
 * (`saveDocumentOffice`) is what tells a real transition from a resubmission
 * of the current value (see its own comment on why that split is safe).
 *
 * `useActionState` (not a hand-rolled `onSubmit`), same as `AdminActionForm`:
 * the pending state is the framework's, and the form still works as a real
 * POST target without client JS.
 */
export function DocumentSheet({
  document,
  orgSlug,
}: {
  document: OwnerDocumentDetail
  orgSlug: string
}) {
  const t = useBetaTranslations()
  const [open, setOpen] = React.useState(false)
  const [state, formAction, pending] = React.useActionState(
    saveDocumentOfficeAction,
    PRO_UCETNI_ACTION_IDLE,
  )

  // Close on a successful save — adjusted during render rather than in a
  // `useEffect` (React's own recommended pattern for "state derived from a
  // changed value", avoiding the extra render pass an effect would cost).
  const [seenState, setSeenState] = React.useState(state)
  if (state !== seenState) {
    setSeenState(state)
    if (state.status === "ok") setOpen(false)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          {t("ucetni.open")}
        </Button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{document.filename}</SheetTitle>
          <SheetDescription>{t("ucetni.sheetDescription")}</SheetDescription>
        </SheetHeader>

        <form action={formAction} className="grid gap-4 px-4">
          <input type="hidden" name="orgSlug" value={orgSlug} />
          <input type="hidden" name="documentId" value={document.id} />

          <div className="grid gap-2">
            <Label htmlFor="status">{t("ucetni.fieldStatus")}</Label>
            <NativeSelect
              id="status"
              name="status"
              defaultValue={document.status}
              className="w-full"
            >
              {STATUS_OPTIONS.map((status) => (
                <NativeSelectOption key={status} value={status}>
                  {t(STATUS_LABEL_KEY[status])}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="docType">{t("ucetni.fieldDocType")}</Label>
            <NativeSelect
              id="docType"
              name="docType"
              defaultValue={document.docType}
              className="w-full"
            >
              {DOC_TYPE_OPTIONS.map((docType) => (
                <NativeSelectOption key={docType} value={docType}>
                  {t(DOC_TYPE_LABEL_KEY[docType])}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="documentDate">
                {t("ucetni.fieldDocumentDate")}
              </Label>
              <Input
                id="documentDate"
                name="documentDate"
                type="date"
                defaultValue={document.documentDate ?? ""}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="amount">{t("ucetni.fieldAmount")}</Label>
              <Input
                id="amount"
                name="amount"
                inputMode="decimal"
                defaultValue={document.amount ?? ""}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="siteRef">{t("ucetni.fieldSiteRef")}</Label>
            <Input
              id="siteRef"
              name="siteRef"
              defaultValue={document.siteRef ?? ""}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="officeMessage">
              {t("ucetni.fieldOfficeMessage")}
            </Label>
            <Textarea
              id="officeMessage"
              name="officeMessage"
              rows={3}
              defaultValue={document.officeMessage ?? ""}
            />
            <p className="text-xs text-muted-foreground">
              {t("ucetni.fieldOfficeMessageHint")}
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="internalNote">
              {t("ucetni.fieldInternalNote")}
            </Label>
            <Textarea
              id="internalNote"
              name="internalNote"
              rows={3}
              defaultValue={document.note ?? ""}
            />
            <p className="text-xs text-muted-foreground">
              {t("ucetni.fieldInternalNoteHint")}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="clientVisible"
              name="clientVisible"
              defaultChecked={document.clientVisible}
            />
            <Label htmlFor="clientVisible" className="font-normal">
              {t("ucetni.fieldClientVisible")}
            </Label>
          </div>

          {state.status === "error" ? (
            <Alert variant="destructive">
              <AlertDescription>{t(state.error)}</AlertDescription>
            </Alert>
          ) : null}

          <SheetFooter className="px-0">
            <Button type="submit" disabled={pending}>
              {pending ? t("ucetni.pending") : t("ucetni.save")}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
