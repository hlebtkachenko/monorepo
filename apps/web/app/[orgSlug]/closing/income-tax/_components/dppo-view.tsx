"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import type { Dppo, DppoTaxpayerCategory } from "@workspace/accounting"
import {
  ContentHeader,
  ContentPanel,
  RecordWorkspace,
} from "@workspace/ui/blocks/app-content"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Textarea } from "@workspace/ui/components/textarea"

import { AppPageHeader } from "../../../../_components/app-page-header"
import { formatDecimal } from "../../../../_components/_shared/accounting-format"
import type { CorporateIncomeTaxResult } from "../_lib/income-tax-data"
import {
  DPPO_ADJUSTMENT_FIELDS,
  DPPO_TAXPAYER_CATEGORIES,
  dppoAdjustmentFormFromWorksheet,
  type DppoAdjustmentFieldValue,
} from "../_lib/dppo-adjustment-form"
import { saveDppoAdjustmentsAction } from "../actions"
import { AnnualStatusMessage } from "../../_components/annual-status-message"
import { AnnualCompletenessAlert } from "../../_components/annual-completeness-alert"

/** One DPPO computation line — `sazba` is a rate (§21), every other field is a Kč amount. */
interface DppoLine {
  key:
    | "ucetni_vysledek"
    | "nedanove_naklady"
    | "osvobozene_vynosy"
    | "zaklad_dane"
    | "odpocet_ztraty"
    | "zaklad_zaokrouhleny"
    | "sazba"
    | "dan"
    | "slevy"
    | "dan_po_slevach"
    | "zalohy"
    | "doplatek"
  label: string
  format?: "rate"
}

const DPPO_LINES: DppoLine[] = [
  { key: "ucetni_vysledek", label: "Účetní výsledek hospodaření (§23/2)" },
  { key: "nedanove_naklady", label: "Daňově neuznatelné náklady (§25)" },
  {
    key: "osvobozene_vynosy",
    label: "Osvobozené / nezahrnované výnosy (§18a, §19)",
  },
  { key: "zaklad_dane", label: "Základ daně (§23/1)" },
  {
    key: "odpocet_ztraty",
    label: "Odpočet daňové ztráty minulých let (§34)",
  },
  {
    key: "zaklad_zaokrouhleny",
    label: "Základ daně zaokrouhlený na celé tisíce Kč (§21)",
  },
  { key: "sazba", label: "Sazba daně", format: "rate" },
  { key: "dan", label: "Daň" },
  { key: "slevy", label: "Slevy na dani (§35)" },
  { key: "dan_po_slevach", label: "Daň po slevách" },
  { key: "zalohy", label: "Zaplacené zálohy (§38a)" },
  { key: "doplatek", label: "Doplatek / přeplatek" },
]

/** `Decimal` rate ("0.2100") -> "21 %" — display formatting only, no money math. */
function formatRate(value: string): string {
  const n = Number(value)
  return `${(n * 100).toFixed(0)} %`
}

function formatDppoValue(dppo: Dppo, line: DppoLine): string {
  const value = dppo[line.key]
  if (value == null) return "Needs input"
  return line.format === "rate" ? formatRate(value) : formatDecimal(value)
}

type OkResult = Extract<CorporateIncomeTaxResult, { status: "ok" }>

/**
 * Corporation tax (DPPO — daň z příjmů právnických osob, Act 586/1992 Sb.) —
 * the active accounting period's real computed figures from `buildDppo`.
 * Annual: one computation per period, no filing-period picker (unlike VAT).
 * Book values remain visible while missing statutory inputs block derived
 * totals; owners/admins supply those inputs through the additive edit form.
 */
export function DppoView({ data }: { data: CorporateIncomeTaxResult }) {
  return (
    <>
      <AppPageHeader>
        <ContentHeader title="Corporation tax" />
      </AppPageHeader>
      <ContentPanel bodyClassName="flex min-h-0 flex-col p-0">
        <RecordWorkspace maxWidth="5xl">
          {data.status !== "ok" ? (
            <AnnualStatusMessage data={data} />
          ) : (
            <DppoWorksheet data={data} />
          )}
        </RecordWorkspace>
      </ContentPanel>
    </>
  )
}

/** The read-only worksheet + the owner/admin adjustments editor (additive). */
function DppoWorksheet({ data }: { data: OkResult }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [form, setForm] = React.useState(() =>
    dppoAdjustmentFormFromWorksheet(data.dppo),
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
    const missingReference = DPPO_ADJUSTMENT_FIELDS.some(({ key }) => {
      const field = form.fields[key]
      return field.amount.trim() !== "" && field.reference.trim() === ""
    })
    if (missingReference) {
      toast.error("Each answered amount needs a reference")
      return
    }
    setBusy(true)
    const result = await saveDppoAdjustmentsAction(data.slug, {
      taxpayerCategory:
        form.taxpayerCategory === "" ? null : form.taxpayerCategory,
      fields: form.fields,
    })
    setBusy(false)
    if (result.ok) {
      toast.success("DPPO inputs saved")
      setOpen(false)
      router.refresh()
    } else {
      toast.error("Could not save DPPO inputs", {
        description:
          result.errorKey === "invalidInput"
            ? "Check that each answered amount is a number with its reference."
            : result.errorKey === "noPeriod"
              ? "No active accounting period."
              : "You may not have permission to edit these inputs.",
      })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{data.periodLabel}</p>

      <AnnualCompletenessAlert completeness={data.dppo.completeness} />

      <Card className="p-0">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Line</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {DPPO_LINES.map((line) => (
                <TableRow key={line.key}>
                  <TableCell>{line.label}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatDppoValue(data.dppo, line)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {data.canEdit ? (
        <div className="flex items-center justify-end">
          <Dialog
            open={open}
            onOpenChange={(next) => {
              // Re-prefill from the current worksheet each time the dialog opens.
              if (next) setForm(dppoAdjustmentFormFromWorksheet(data.dppo))
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
                  Provenanced statutory adjustments the worksheet needs. Leave
                  an amount blank if not yet answered; any amount entered
                  (including 0) requires a reference. Saved as source USER with
                  a server-recorded timestamp.
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
                    <Field
                      key={key}
                      data-invalid={needsReference ? true : undefined}
                    >
                      <FieldLabel htmlFor={`${id}-amount`}>
                        {label} ({statute})
                      </FieldLabel>
                      <Input
                        id={`${id}-amount`}
                        inputMode="decimal"
                        placeholder="0.00"
                        value={value.amount}
                        onChange={(e) =>
                          setField(key, { amount: e.target.value })
                        }
                      />
                      <Textarea
                        id={`${id}-reference`}
                        aria-label={`${label} reference`}
                        placeholder="Source / rationale (required once an amount is entered)"
                        value={value.reference}
                        onChange={(e) =>
                          setField(key, { reference: e.target.value })
                        }
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
        </div>
      ) : null}
    </div>
  )
}
