"use client"

import * as React from "react"

import {
  ContentHeader,
  ContentPanel,
  ContentToolbar,
  RecordWorkspace,
  type ContentTab,
} from "@workspace/ui/blocks/app-content"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { ButtonGroup } from "@workspace/ui/components/button-group"
import { Card } from "@workspace/ui/components/card"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { IconButton } from "@workspace/ui/components/icon-button"
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
import { useIcons } from "@workspace/ui/icon-packs"

import { OrgPageHeader } from "../org-page-header"
import { DocumentPreview } from "./document-preview"
import { LineItemsGrid } from "./line-items"
import { ATTACHMENTS, LINE_ITEMS, SINGLE_TABS, type SingleView } from "./data"

const RECORD_NUMBER = "FV-2026-0001"
const SUPPLIER = "ČEZ, a.s."
const num = (n: number) => n.toLocaleString("cs-CZ")

function FormField({
  id,
  label,
  children,
  className,
}: {
  id: string
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <Field className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children}
    </Field>
  )
}

function SelectField({
  id,
  defaultValue,
  options,
}: {
  id: string
  defaultValue: string
  options: { value: string; label: string }[]
}) {
  return (
    <Select defaultValue={defaultValue}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function HeaderSection() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <FormField id="f-type" label="Invoice type">
        <SelectField
          id="f-type"
          defaultValue="received"
          options={[
            { value: "received", label: "Received invoice" },
            { value: "issued", label: "Issued invoice" },
            { value: "advance", label: "Advance" },
          ]}
        />
      </FormField>
      <FormField id="f-vs" label="Variable symbol">
        <Input id="f-vs" defaultValue="20260001" />
      </FormField>
      <FormField id="f-supplier" label="Supplier">
        <Input id="f-supplier" defaultValue={SUPPLIER} />
      </FormField>
      <FormField id="f-issued" label="Issued">
        <Input id="f-issued" type="date" defaultValue="2026-06-12" />
      </FormField>
      <FormField id="f-due" label="Due">
        <Input id="f-due" type="date" defaultValue="2026-06-26" />
      </FormField>
      <FormField id="f-taxdate" label="Tax point">
        <Input id="f-taxdate" type="date" defaultValue="2026-06-12" />
      </FormField>
      <FormField id="f-center" label="Cost centre">
        <SelectField
          id="f-center"
          defaultValue="hq"
          options={[
            { value: "hq", label: "HQ" },
            { value: "branch", label: "Branch" },
          ]}
        />
      </FormField>
      <FormField id="f-order" label="Order">
        <Input id="f-order" placeholder="—" />
      </FormField>
      <FormField id="f-responsible" label="Responsible">
        <Input id="f-responsible" defaultValue="J. Novák" />
      </FormField>
      <FormField
        id="f-desc"
        label="Description"
        className="sm:col-span-2 lg:col-span-3"
      >
        <Textarea
          id="f-desc"
          rows={2}
          defaultValue="Coffee supply, June 2026."
        />
      </FormField>
    </div>
  )
}

function AccountingSection() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <FormField id="a-acc" label="Account">
        <SelectField
          id="a-acc"
          defaultValue="321"
          options={[
            { value: "321", label: "321 — Suppliers" },
            { value: "504", label: "504 — Goods sold" },
          ]}
        />
      </FormField>
      <FormField id="a-vat" label="VAT regime">
        <SelectField
          id="a-vat"
          defaultValue="standard"
          options={[
            { value: "standard", label: "Standard" },
            { value: "reverse", label: "Reverse charge" },
          ]}
        />
      </FormField>
      <FormField id="a-activity" label="Activity">
        <Input id="a-activity" defaultValue="Hospitality" />
      </FormField>
    </div>
  )
}

function OtherSection() {
  return (
    <div className="grid gap-4">
      <FormField id="o-note" label="Internal note">
        <Textarea
          id="o-note"
          rows={4}
          placeholder="Notes visible to the team…"
        />
      </FormField>
    </div>
  )
}

function PaymentSection() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <FormField id="p-method" label="Payment method">
        <SelectField
          id="p-method"
          defaultValue="transfer"
          options={[
            { value: "transfer", label: "Bank transfer" },
            { value: "cash", label: "Cash" },
            { value: "card", label: "Card" },
          ]}
        />
      </FormField>
      <FormField id="p-account" label="Bank account">
        <Input id="p-account" defaultValue="27566234 / 0300" />
      </FormField>
      <FormField id="p-currency" label="Currency">
        <SelectField
          id="p-currency"
          defaultValue="czk"
          options={[
            { value: "czk", label: "CZK" },
            { value: "eur", label: "EUR" },
          ]}
        />
      </FormField>
    </div>
  )
}

function AttachmentsSection() {
  const icons = useIcons()
  return (
    <ul className="space-y-2">
      {ATTACHMENTS.map((file) => {
        const Icon = icons[file.icon]
        return (
          <li
            key={file.id}
            className="flex items-center gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10"
          >
            <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-foreground">
              <Icon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground">{file.size}</p>
            </div>
            <IconButton
              icon="Download"
              aria-label={`Download ${file.name}`}
              tooltip="Download"
              tooltipSide="bottom"
            />
          </li>
        )
      })}
    </ul>
  )
}

/** VAT / totals recap rail — reconciles with the line-items grid. */
function RecapAside() {
  const base = LINE_ITEMS.reduce((s, l) => s + l.base, 0)
  const vat = LINE_ITEMS.reduce((s, l) => s + (l.total - l.base), 0)
  const total = LINE_ITEMS.reduce((s, l) => s + l.total, 0)
  return (
    <Card className="gap-4 p-4">
      <div className="space-y-0.5">
        <p className="font-heading text-base font-medium">{SUPPLIER}</p>
        <p className="text-sm text-muted-foreground">
          Supplier · VAT registered
        </p>
      </div>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Base</dt>
          <dd className="tabular-nums">{num(base)} Kč</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">VAT</dt>
          <dd className="tabular-nums">{num(vat)} Kč</dd>
        </div>
        <div className="flex justify-between gap-2 border-t border-border pt-2 font-medium">
          <dt>Total</dt>
          <dd className="tabular-nums">{num(total)} Kč</dd>
        </div>
      </dl>
    </Card>
  )
}

function LineItems() {
  return (
    <div>
      <div className="flex items-center gap-1 border-b border-border-subtle px-3 py-1.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => toast.success("Row added")}
        >
          + Add row
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => toast.success("Selected rows removed")}
        >
          Delete
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => toast.success("Import from Excel…")}
        >
          Import
        </Button>
      </div>
      <LineItemsGrid rows={LINE_ITEMS} />
    </div>
  )
}

/**
 * Single archetype demo (#425) — an ABRA-style record workspace. Section tabs in
 * the content header swap a dense form; the "Header" section also shows the
 * line-items grid (our Table machinery) + a VAT recap rail; a toolbar toggles a
 * document preview in the inspector; a sticky footer holds Save / Close. The
 * `RecordWorkspace` block is generic — other record types simply omit the
 * line-items / aside / preview slots.
 */
export function SingleDemo() {
  const [view, setView] = React.useState<SingleView>("header")
  const [previewOpen, setPreviewOpen] = React.useState(false)

  const tabs: ContentTab[] = SINGLE_TABS.map((t) => ({
    value: t.value,
    label: t.label,
  }))

  const sectionContent =
    view === "header" ? (
      <HeaderSection />
    ) : view === "accounting" ? (
      <AccountingSection />
    ) : view === "other" ? (
      <OtherSection />
    ) : view === "payment" ? (
      <PaymentSection />
    ) : (
      <AttachmentsSection />
    )

  const showLines = view === "header"
  const showAside = view === "header" || view === "payment"

  const toolbar = (
    <ContentToolbar
      right={
        <ButtonGroup>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPreviewOpen((v) => !v)}
          >
            Preview
          </Button>
          <IconButton
            icon="Copy"
            aria-label="Duplicate"
            tooltip="Duplicate"
            tooltipSide="bottom"
            onClick={() => toast.success("Document duplicated")}
          />
          <IconButton
            icon="Download"
            aria-label="Export"
            tooltip="Export"
            tooltipSide="bottom"
            onClick={() => toast.success("Exporting document…")}
          />
        </ButtonGroup>
      }
    />
  )

  return (
    <>
      <OrgPageHeader>
        <ContentHeader
          title={RECORD_NUMBER}
          tabs={tabs}
          value={view}
          onValueChange={(value) => setView(value as SingleView)}
          actions={
            <>
              <Badge variant="secondary" className="h-5">
                To match
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toast("Edit cancelled")}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={() => toast.success("Record saved")}>
                Save
              </Button>
            </>
          }
        />
      </OrgPageHeader>
      <ContentPanel
        bodyClassName="flex min-h-0 flex-col p-0"
        toolbar={toolbar}
        inspector={
          <DocumentPreview
            number={RECORD_NUMBER}
            supplier={SUPPLIER}
            lines={LINE_ITEMS}
          />
        }
        inspectorOpen={previewOpen}
        inspectorMode="panel"
        inspectorTitle="Document preview"
        onInspectorOpenChange={setPreviewOpen}
      >
        <RecordWorkspace
          aside={showAside ? <RecapAside /> : undefined}
          lineItems={showLines ? <LineItems /> : undefined}
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={() => toast("Closed")}>
                Close
              </Button>
              <Button size="sm" onClick={() => toast.success("Record saved")}>
                Save
              </Button>
            </>
          }
        >
          {sectionContent}
        </RecordWorkspace>
      </ContentPanel>
    </>
  )
}
