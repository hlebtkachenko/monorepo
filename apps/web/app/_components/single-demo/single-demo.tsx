"use client"

import * as React from "react"

import {
  ContentHeader,
  ContentPanel,
  ContentStatusBar,
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
import { cn } from "@workspace/ui/lib/utils"

import {
  ManageTabsMenu,
  PageHeaderActions,
  useTabVisibility,
} from "../_shared/content-header-extras"
import { OrgPageHeader } from "../org-page-header"
import { DocumentPreview } from "./document-preview"
import { LineItemsGrid } from "./line-items"
import {
  ATTACHMENTS,
  formatNum,
  ledgerTotals,
  LINE_ITEMS,
  SINGLE_TABS,
  type SingleView,
} from "./data"

const RECORD_NUMBER = "FV-2026-0001"
const SUPPLIER = "ČEZ, a.s."

/**
 * A labeled sub-section inside a tab — a small heading + its own field grid,
 * mirroring ABRA's grouped form (a tab is NOT one flat divider but several
 * named groups). The default grid is a 1/2/3-column field grid; pass `grid` to
 * override (e.g. a single full-width column).
 */
function FormSection({
  title,
  description,
  grid = "sm:grid-cols-2",
  children,
}: {
  title: string
  description?: string
  grid?: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-0.5 border-b border-border-subtle pb-1.5">
        <h3 className="font-heading text-sm font-semibold text-foreground">
          {title}
        </h3>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className={cn("grid gap-4", grid)}>{children}</div>
    </section>
  )
}

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

/**
 * The "Header" tab — three labeled groups (Document, Company, Description),
 * each its own `<section>` with a heading + field grid. The "Amounts" group is
 * the recap rail (the aside), so it isn't repeated here.
 */
function HeaderSection() {
  return (
    <div className="space-y-6">
      <FormSection
        title="Document"
        description="Identification, dates and tax point of the invoice."
      >
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
        <FormField id="f-order" label="Order">
          <Input id="f-order" placeholder="—" />
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
      </FormSection>

      <FormSection
        title="Company"
        description="Supplier, cost allocation and the responsible person."
      >
        <FormField id="f-supplier" label="Supplier">
          <Input id="f-supplier" defaultValue={SUPPLIER} />
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
        <FormField id="f-responsible" label="Responsible">
          <Input id="f-responsible" defaultValue="J. Novák" />
        </FormField>
      </FormSection>

      <FormSection title="Description" grid="grid-cols-1">
        <FormField id="f-desc" label="Description">
          <Textarea
            id="f-desc"
            rows={2}
            defaultValue="Coffee supply, June 2026."
          />
        </FormField>
      </FormSection>
    </div>
  )
}

function AccountingSection() {
  return (
    <div className="space-y-6">
      <FormSection
        title="Posting"
        description="The ledger account and VAT treatment of this document."
      >
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
      </FormSection>
    </div>
  )
}

function OtherSection() {
  return (
    <div className="space-y-6">
      <FormSection title="Internal" grid="grid-cols-1">
        <FormField id="o-note" label="Internal note">
          <Textarea
            id="o-note"
            rows={4}
            placeholder="Notes visible to the team…"
          />
        </FormField>
      </FormSection>
    </div>
  )
}

function PaymentSection() {
  return (
    <div className="space-y-6">
      <FormSection
        title="Settlement"
        description="How and from which account this invoice is paid."
      >
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
      </FormSection>
    </div>
  )
}

function AttachmentsSection() {
  const icons = useIcons()
  return (
    <div className="space-y-6">
      <FormSection title="Files" grid="grid-cols-1">
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
      </FormSection>
    </div>
  )
}

/** VAT / totals recap rail — reconciles with the line-items grid. */
function RecapAside() {
  const { base, vat, total } = ledgerTotals(LINE_ITEMS)
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
          <dd className="tabular-nums">{formatNum(base)} Kč</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">VAT</dt>
          <dd className="tabular-nums">{formatNum(vat)} Kč</dd>
        </div>
        <div className="flex justify-between gap-2 border-t border-border pt-2 font-medium">
          <dt>Total</dt>
          <dd className="tabular-nums">{formatNum(total)} Kč</dd>
        </div>
      </dl>
    </Card>
  )
}

/**
 * The full-width line-items region: a labeled line toolbar above a bounded,
 * scrolling grid. The parent (`RecordWorkspace.lineItems`) gives this a real
 * height, so the grid scrolls inside itself and reads as a usable table.
 */
function LineItems() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-3 py-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          Line items
        </span>
        <div className="ml-2 flex items-center gap-1">
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
      </div>
      <LineItemsGrid rows={LINE_ITEMS} />
    </div>
  )
}

/**
 * Single archetype demo (#425) — an ABRA-style record workspace. Section tabs in
 * the content header swap a dense, grouped form; the "Header" section also shows
 * the full-width line-items grid (our Table machinery) + a VAT recap rail. A
 * ContentToolbar carries the record actions, a ContentStatusBar pins Base / VAT
 * / Total at the bottom, and the document preview stays docked in an
 * always-open inspector panel. A sticky footer holds Save / Close. The
 * `RecordWorkspace` block is generic — other record types simply omit the
 * line-items / aside slots.
 */
export function SingleDemo() {
  const [view, setView] = React.useState<SingleView>("header")

  // Header extras — the same cluster the Table demo carries: manage-tabs (⋯),
  // favorite + config, and tab show/hide.
  const { hidden, toggle, visible } = useTabVisibility(SINGLE_TABS)

  // If the active tab gets hidden, fall back to the first still-visible one.
  React.useEffect(() => {
    if (!visible.some((t) => t.value === view) && visible[0]) {
      setView(visible[0].value as SingleView)
    }
  }, [visible, view])

  const tabs: ContentTab[] = visible.map((t) => ({
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

  const sectionLabel =
    SINGLE_TABS.find((t) => t.value === view)?.label ?? "Section"

  const { base, vat, total } = ledgerTotals(LINE_ITEMS)

  const toolbar = (
    <ContentToolbar
      left={
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-foreground">{sectionLabel}</span>
          <Badge variant="secondary" className="h-5">
            Editing
          </Badge>
        </div>
      }
      right={
        <ButtonGroup>
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
          <Button size="sm" onClick={() => toast.success("Record saved")}>
            Save
          </Button>
        </ButtonGroup>
      }
    />
  )

  const statusBar = (
    <ContentStatusBar
      left={
        <div className="flex items-center gap-4 tabular-nums">
          <span>
            <span className="text-muted-foreground">Base</span>{" "}
            <span className="font-medium text-foreground">
              {formatNum(base)} Kč
            </span>
          </span>
          <span>
            <span className="text-muted-foreground">VAT</span>{" "}
            <span className="font-medium text-foreground">
              {formatNum(vat)} Kč
            </span>
          </span>
          <span>
            <span className="text-muted-foreground">Total</span>{" "}
            <span className="font-semibold text-foreground">
              {formatNum(total)} Kč
            </span>
          </span>
        </div>
      }
      right={
        <span className="text-muted-foreground">
          {LINE_ITEMS.length} {LINE_ITEMS.length === 1 ? "line" : "lines"}
        </span>
      }
    />
  )

  return (
    <>
      <OrgPageHeader>
        <ContentHeader
          icon={
            <IconButton
              icon="ArrowLeft"
              aria-label="Back"
              tooltip="Back"
              tooltipSide="bottom"
              onClick={() => toast("Back to the list")}
            />
          }
          title={RECORD_NUMBER}
          tabs={tabs}
          value={view}
          onValueChange={(value) => setView(value as SingleView)}
          manageTabs={
            <ManageTabsMenu
              tabs={SINGLE_TABS}
              hidden={hidden}
              onToggle={toggle}
            />
          }
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
              <PageHeaderActions />
            </>
          }
        />
      </OrgPageHeader>
      <ContentPanel
        bodyClassName="flex min-h-0 flex-col p-0"
        toolbar={toolbar}
        statusBar={statusBar}
        inspector={
          <DocumentPreview
            number={RECORD_NUMBER}
            supplier={SUPPLIER}
            lines={LINE_ITEMS}
          />
        }
        inspectorOpen
        inspectorMode="panel"
        inspectorTitle="Document preview"
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
