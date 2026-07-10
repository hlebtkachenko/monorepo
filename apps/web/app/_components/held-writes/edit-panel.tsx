"use client"

/**
 * [M1.7] Edit-before-approve UI (A-Z 2.6) — the reviewer-editable form layered
 * over the held-write inspector's read-only display (`columns.tsx`). Renders
 * exactly the fields `edit-model.ts` knows how to merge back onto the
 * original payload: the header date, per-rate VAT amounts (document), and
 * double-entry posting lines (posting). `draftFromRow` / `draftToEdit` are
 * pure so the mapping between "what's on screen" and "what
 * `resolveHeldWrite` receives" is unit-testable without mounting React.
 */
import * as React from "react"

import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@workspace/ui/components/combobox"
import { DetailField } from "@workspace/ui/blocks/app-content"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import type { HeldWriteEdit } from "./edit-model"
import type {
  HeldWriteHeader,
  HeldWritePostingLineRow,
  HeldWriteVatSummaryRow,
} from "./view-model"

/** A chart-of-accounts option for the posting-line account picker ("211 — Pokladna"). */
export interface AccountOption {
  id: string
  label: string
}

// The two drafts below are internal to `HeldWriteEditDraft` — the only shape
// `columns.tsx` needs (it never edits a single VAT row or posting line in
// isolation, only the whole draft object via `onDraftChange`).

interface HeldWriteVatAmountDraft {
  rateLabel: string
  base: string
  vat: string
  /** Mirrors `HeldWriteVatSummaryRow.partialCount === 1` — false rows render read-only. */
  editable: boolean
}

interface HeldWritePostingLineDraft {
  accountId: string
  side: "DEBIT" | "CREDIT"
  amount: string
}

export interface HeldWriteEditDraft {
  /** "YYYY-MM-DD" — normalized from `header.date` for the native date input. */
  date: string
  vatAmounts: HeldWriteVatAmountDraft[]
  postingLines: HeldWritePostingLineDraft[]
}

/** `header.date` may carry a full ISO datetime; a native date input only accepts "YYYY-MM-DD". */
function toDateInputValue(date: string | null): string {
  return date ? date.slice(0, 10) : ""
}

/** Seed an edit draft from the row's already-shaped display data (never the raw payload). */
export function draftFromRow(row: {
  header: HeldWriteHeader
  vat_summary: HeldWriteVatSummaryRow[]
  posting_lines: HeldWritePostingLineRow[]
}): HeldWriteEditDraft {
  return {
    date: toDateInputValue(row.header.date),
    vatAmounts: row.vat_summary.map((r) => ({
      rateLabel: r.rateLabel,
      base: r.base,
      vat: r.vat,
      editable: r.partialCount === 1,
    })),
    postingLines: row.posting_lines.map((l) => ({ ...l })),
  }
}

/** Shape a draft into the `resolveHeldWrite` edit payload for the given tool. */
export function draftToEdit(
  draft: HeldWriteEditDraft,
  toolName: string,
): HeldWriteEdit {
  const edit: HeldWriteEdit = {}
  if (draft.date) edit.header = { date: draft.date }
  if (toolName === "captureAccountingDocument") {
    const vatAmounts = draft.vatAmounts
      .filter((r) => r.editable)
      .map(({ rateLabel, base, vat }) => ({ rateLabel, base, vat }))
    if (vatAmounts.length > 0) edit.vatAmounts = vatAmounts
  }
  if (toolName === "createAccountingPosting" && draft.postingLines.length > 0) {
    edit.postingLines = draft.postingLines.map(
      ({ accountId, side, amount }) => ({
        accountId,
        side,
        amount,
      }),
    )
  }
  return edit
}

/** The editable date field — replaces the read-only "Datum" row while editing. */
function DateEditField({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <Field orientation="horizontal">
      <FieldLabel htmlFor="held-write-edit-date">Datum</FieldLabel>
      <Input
        id="held-write-edit-date"
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-fit"
      />
    </Field>
  )
}

/** Editable per-rate VAT amounts — a row is only editable when it rolls up exactly ONE partial. */
function VatAmountsEditTable({
  rows,
  onChange,
}: {
  rows: HeldWriteVatAmountDraft[]
  onChange: (rows: HeldWriteVatAmountDraft[]) => void
}) {
  if (rows.length === 0) return null

  const update = (index: number, patch: Partial<HeldWriteVatAmountDraft>) => {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        Rozpis DPH podle sazby
      </span>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-muted-foreground">Sazba</TableHead>
            <TableHead className="text-right text-muted-foreground">
              Základ
            </TableHead>
            <TableHead className="text-right text-muted-foreground">
              DPH
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={row.rateLabel} className="hover:bg-transparent">
              <TableCell>{row.rateLabel}</TableCell>
              <TableCell className="text-right">
                {row.editable ? (
                  <Input
                    aria-label={`Základ (${row.rateLabel})`}
                    value={row.base}
                    onChange={(event) =>
                      update(i, { base: event.target.value })
                    }
                    className="ml-auto h-7 w-28 text-right"
                    inputMode="decimal"
                  />
                ) : (
                  <span
                    className="text-muted-foreground"
                    title="Více položek se stejnou sazbou — nelze upravit jednotlivě"
                  >
                    {row.base}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right">
                {row.editable ? (
                  <Input
                    aria-label={`DPH (${row.rateLabel})`}
                    value={row.vat}
                    onChange={(event) => update(i, { vat: event.target.value })}
                    className="ml-auto h-7 w-28 text-right"
                    inputMode="decimal"
                  />
                ) : (
                  <span className="text-muted-foreground">{row.vat}</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/** Editable double-entry posting lines — account (combobox), side, amount. */
function PostingLinesEditTable({
  rows,
  accounts,
  onChange,
}: {
  rows: HeldWritePostingLineDraft[]
  accounts: AccountOption[]
  onChange: (rows: HeldWritePostingLineDraft[]) => void
}) {
  if (rows.length === 0) return null

  const update = (index: number, patch: Partial<HeldWritePostingLineDraft>) => {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        Zápisy (MD/D)
      </span>
      <div className="flex flex-col gap-2">
        {rows.map((line, i) => (
          <div
            key={i}
            className="flex items-center gap-2 rounded-md border p-2"
          >
            <Combobox
              value={line.accountId}
              onValueChange={(value) => update(i, { accountId: value ?? "" })}
            >
              <ComboboxInput
                placeholder="Účet…"
                className="w-56"
                aria-label="Účet"
              />
              <ComboboxContent>
                <ComboboxList>
                  {accounts.map((a) => (
                    <ComboboxItem key={a.id} value={a.id}>
                      {a.label}
                    </ComboboxItem>
                  ))}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
            <NativeSelect
              size="sm"
              aria-label="Strana"
              value={line.side}
              onChange={(event) =>
                update(i, {
                  side: event.target.value === "CREDIT" ? "CREDIT" : "DEBIT",
                })
              }
              className="w-24"
            >
              <NativeSelectOption value="DEBIT">MD</NativeSelectOption>
              <NativeSelectOption value="CREDIT">Dal</NativeSelectOption>
            </NativeSelect>
            <Input
              aria-label="Částka"
              value={line.amount}
              onChange={(event) => update(i, { amount: event.target.value })}
              className="w-32 text-right"
              inputMode="decimal"
            />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * The full edit surface for a held write's inspector — swaps in for the
 * read-only header/VAT/posting-lines display while `editing` is on.
 */
export function HeldWriteEditFields({
  toolName,
  draft,
  onDraftChange,
  accounts,
}: {
  toolName: string
  draft: HeldWriteEditDraft
  onDraftChange: (draft: HeldWriteEditDraft) => void
  accounts: AccountOption[]
}) {
  return (
    <div className="flex flex-col gap-4 rounded-md border bg-muted/30 p-3">
      <DetailField
        label="Datum"
        value={
          <DateEditField
            value={draft.date}
            onChange={(date) => onDraftChange({ ...draft, date })}
          />
        }
      />
      {toolName === "captureAccountingDocument" ? (
        <VatAmountsEditTable
          rows={draft.vatAmounts}
          onChange={(vatAmounts) => onDraftChange({ ...draft, vatAmounts })}
        />
      ) : null}
      {toolName === "createAccountingPosting" ? (
        <PostingLinesEditTable
          rows={draft.postingLines}
          accounts={accounts}
          onChange={(postingLines) => onDraftChange({ ...draft, postingLines })}
        />
      ) : null}
    </div>
  )
}
