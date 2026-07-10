"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import type { Dppo, DppoTaxpayerCategory } from "@workspace/accounting"
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
import { Field, FieldError, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { toast } from "@workspace/ui/components/sonner"
import { Textarea } from "@workspace/ui/components/textarea"

import {
  DPPO_ADJUSTMENT_FIELDS,
  DPPO_TAXPAYER_CATEGORIES,
  DppoAdjustmentInputSchema,
  dppoAdjustmentFormFromWorksheet,
  type DppoAdjustmentFieldValue,
} from "../_lib/dppo-adjustment-form"
import {
  saveDppoAdjustmentsAction,
  type IncomeTaxActionResult,
} from "../actions"

type SaveErrorKey = Extract<IncomeTaxActionResult, { ok: false }>["errorKey"]

const SAVE_ERROR_MESSAGES: Record<SaveErrorKey, string> = {
  forbidden: "You may not have permission to edit these inputs.",
  invalidInput:
    "Check that each answered amount is a number with its reference.",
  noPeriod: "No active accounting period.",
  saveFailed: "Could not save the DPPO inputs. Please try again.",
}

/**
 * Owner/admin editor for the provenanced DPPO adjustments — the only client
 * island on the Corporation tax page. The read-only worksheet stays
 * server-rendered (see dppo-view.tsx); this dialog owns the form state, the
 * save action call, and the toasts. Validation runs through the shared
 * `DppoAdjustmentInputSchema` (same schema the server action re-checks).
 */
export function DppoAdjustmentsDialog({
  slug,
  dppo,
}: {
  slug: string
  dppo: Dppo
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [form, setForm] = React.useState(() =>
    dppoAdjustmentFormFromWorksheet(dppo),
  )

  function setField(
    key: (typeof DPPO_ADJUSTMENT_FIELDS)[number]["key"],
    patch: Partial<DppoAdjustmentFieldValue>,
  ) {
    setForm((previous) => ({
      ...previous,
      fields: {
        ...previous.fields,
        [key]: { ...previous.fields[key], ...patch },
      },
    }))
  }

  async function onSave() {
    const parsed = DppoAdjustmentInputSchema.safeParse({
      taxpayerCategory:
        form.taxpayerCategory === "" ? null : form.taxpayerCategory,
      fields: form.fields,
    })
    if (!parsed.success) {
      toast.error("Check the DPPO inputs", {
        description: parsed.error.issues[0]?.message,
      })
      return
    }
    setBusy(true)
    const result = await saveDppoAdjustmentsAction(slug, parsed.data)
    setBusy(false)
    if (result.ok) {
      toast.success("DPPO inputs saved")
      setOpen(false)
      router.refresh()
    } else {
      toast.error("Could not save DPPO inputs", {
        description: SAVE_ERROR_MESSAGES[result.errorKey],
      })
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Re-prefill from the current worksheet each time the dialog opens.
        if (next) setForm(dppoAdjustmentFormFromWorksheet(dppo))
        setOpen(next)
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">Edit tax inputs</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>DPPO tax inputs</DialogTitle>
          <DialogDescription>
            Provenanced statutory adjustments the worksheet needs. Leave an
            amount blank if not yet answered; any amount entered (including 0)
            requires a reference. Saved as source USER with a server-recorded
            timestamp.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field>
            <FieldLabel id="dppo-taxpayer-category-label">
              Taxpayer category (§21)
            </FieldLabel>
            <Select
              value={form.taxpayerCategory || undefined}
              onValueChange={(value) =>
                setForm((previous) => ({
                  ...previous,
                  taxpayerCategory: value as DppoTaxpayerCategory,
                }))
              }
            >
              <SelectTrigger
                aria-labelledby="dppo-taxpayer-category-label"
                className="w-full"
              >
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {DPPO_TAXPAYER_CATEGORIES.map((category) => (
                  <SelectItem key={category.value} value={category.value}>
                    {category.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {DPPO_ADJUSTMENT_FIELDS.map(({ key, id, label, statute }) => {
            const value = form.fields[key]
            const needsReference =
              value.amount.trim() !== "" && value.reference.trim() === ""
            return (
              <Field key={key} data-invalid={needsReference ? true : undefined}>
                <FieldLabel htmlFor={`${id}-amount`}>
                  {label} ({statute})
                </FieldLabel>
                <Input
                  id={`${id}-amount`}
                  inputMode="decimal"
                  placeholder="0.00"
                  value={value.amount}
                  onChange={(e) => setField(key, { amount: e.target.value })}
                />
                <Textarea
                  id={`${id}-reference`}
                  aria-label={`${label} reference`}
                  placeholder="Source / rationale (required once an amount is entered)"
                  value={value.reference}
                  onChange={(e) => setField(key, { reference: e.target.value })}
                />
                {needsReference ? (
                  <FieldError>
                    A reference is required for an answered amount.
                  </FieldError>
                ) : null}
              </Field>
            )
          })}
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button size="sm" disabled={busy} onClick={() => void onSave()}>
            {busy ? "Saving…" : "Save inputs"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
