"use client"

import * as React from "react"
import {
  Calendar as CalendarIcon,
  ChevronDown,
  Copy,
  Pencil,
  Plus,
  ScanLine,
  Upload,
  X,
} from "lucide-react"

import {
  ContentHeader,
  ContentPanel,
  ContentStatusBar,
  ContentToolbar,
  RecordWorkspace,
} from "@workspace/ui/blocks/content-panel"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { ButtonGroup } from "@workspace/ui/components/button-group"
import { Calendar } from "@workspace/ui/components/calendar"
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@workspace/ui/components/combobox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { IconButton } from "@workspace/ui/components/icon-button"
import { Input } from "@workspace/ui/components/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@workspace/ui/components/input-group"
import {
  InputTags,
  InputTagsInput,
  InputTagsItem,
  InputTagsList,
} from "@workspace/ui/components/input-tags"
import { PhoneInput } from "@workspace/ui/components/input-phone"
import {
  KeyValue,
  KeyValueItem,
  KeyValueKeyInput,
  KeyValueList,
  KeyValueValueInput,
} from "@workspace/ui/components/key-value"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { Textarea } from "@workspace/ui/components/textarea"
import { cn } from "@workspace/ui/lib/utils"

import { AppPageHeader } from "../app-page-header"
import { LineItemsGrid, type LineRow } from "./line-items"
import {
  COMPANIES,
  CONTACTS,
  formatNum,
  ledgerTotals,
  LINE_ITEMS,
  recomputeLine,
  vatRecap,
} from "./data"

const RECORD_NUMBER = "VF3-0001/2026"

/* -------------------------------------------------------------------------- */
/* Field helpers                                                              */
/* -------------------------------------------------------------------------- */

/** A labelled shadcn Select. */
function SelectField({
  id,
  label,
  defaultValue,
  options,
  className,
}: {
  id: string
  label: string
  defaultValue: string
  options: { value: string; label: string }[]
  className?: string
}) {
  return (
    <Field className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
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
    </Field>
  )
}

/** A labelled date field — a real Popover + Calendar picker (not a raw input). */
function DateField({
  id,
  label,
  defaultDate,
  className,
}: {
  id: string
  label: string
  defaultDate?: Date
  className?: string
}) {
  const [date, setDate] = React.useState<Date | undefined>(defaultDate)
  return (
    <Field className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="outline"
            className="w-full justify-start gap-2 font-normal"
          >
            <CalendarIcon className="size-4 text-muted-foreground" />
            {date ? (
              date.toLocaleDateString("cs-CZ")
            ) : (
              <span className="text-muted-foreground">Select date</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar mode="single" selected={date} onSelect={setDate} />
        </PopoverContent>
      </Popover>
    </Field>
  )
}

/** A labelled native select. */
function NativeSelectField({
  id,
  label,
  defaultValue,
  options,
  className,
}: {
  id: string
  label: string
  defaultValue: string
  options: { value: string; label: string }[]
  className?: string
}) {
  return (
    <Field className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect id={id} defaultValue={defaultValue} className="w-full">
        {options.map((o) => (
          <NativeSelectOption key={o.value} value={o.value}>
            {o.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  )
}

/** A labelled searchable combobox. */
function ComboboxField({
  id,
  label,
  defaultValue,
  options,
  className,
}: {
  id: string
  label: string
  defaultValue: string
  options: string[]
  className?: string
}) {
  const [value, setValue] = React.useState(defaultValue)
  return (
    <Field className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Combobox value={value} onValueChange={(v) => setValue(v ?? "")}>
        <ComboboxInput id={id} placeholder="Search…" className="w-full" />
        <ComboboxContent>
          <ComboboxList>
            {options.map((o) => (
              <ComboboxItem key={o} value={o}>
                {o}
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </Field>
  )
}

/** A labelled input-group with a trailing text addon (`%`, `Kč`, `kg`). */
function AddonField({
  id,
  label,
  defaultValue,
  addon,
  className,
}: {
  id: string
  label: string
  defaultValue: string
  addon: string
  className?: string
}) {
  return (
    <Field className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={id}
          defaultValue={defaultValue}
          inputMode="numeric"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupText>{addon}</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
    </Field>
  )
}

/** A labelled plain input. */
function TextField({
  id,
  label,
  className,
  ...props
}: { id: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <Field className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} {...props} />
    </Field>
  )
}

/**
 * A record panel — a card with a local tab strip and, below it, the active
 * tab's field grid. The three panels (Document / Party / Amounts) each own an
 * independent `Tabs` and are laid out side-by-side by `RecordWorkspace`'s
 * panels layout.
 */
function Panel({
  title,
  defaultTab,
  tabs,
}: {
  title: string
  defaultTab: string
  tabs: { value: string; label: string; content: React.ReactNode }[]
}) {
  return (
    <section
      aria-label={title}
      className="rounded-xl bg-card p-4 ring-1 ring-foreground/10"
    >
      <Tabs defaultValue={defaultTab}>
        <TabsList variant="line" className="mb-4 w-full justify-start">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((t) => (
          <TabsContent key={t.value} value={t.value}>
            {t.content}
          </TabsContent>
        ))}
      </Tabs>
    </section>
  )
}

const TWO_COL = "grid grid-cols-1 gap-4 sm:grid-cols-2"

/* -------------------------------------------------------------------------- */
/* Left panel — Document                                                      */
/* -------------------------------------------------------------------------- */

function DocumentPanel() {
  return (
    <Panel
      title="Document"
      defaultTab="header"
      tabs={[
        {
          value: "header",
          label: "Header",
          content: (
            <div className={TWO_COL}>
              <SelectField
                id="d-type"
                label="Invoice type"
                defaultValue="issued"
                className="sm:col-span-2"
                options={[
                  { value: "issued", label: "Issued invoice" },
                  { value: "advance", label: "Advance" },
                  { value: "credit", label: "Credit note" },
                ]}
              />
              <TextField
                id="d-vs"
                label="Variable symbol"
                defaultValue="30001"
              />
              <DateField
                id="d-issued"
                label="Issued"
                defaultDate={new Date(2026, 5, 12)}
              />
              <DateField
                id="d-due"
                label="Due"
                defaultDate={new Date(2026, 5, 26)}
              />
              <DateField
                id="d-taxpoint"
                label="Tax point"
                defaultDate={new Date(2026, 5, 12)}
              />
              <DateField
                id="d-posting"
                label="Posting date"
                defaultDate={new Date(2026, 5, 12)}
              />
              <NativeSelectField
                id="d-order"
                label="Order"
                defaultValue="none"
                options={[
                  { value: "none", label: "—" },
                  { value: "ord-1", label: "ORD-2026-0044" },
                  { value: "ord-2", label: "ORD-2026-0051" },
                ]}
              />
              <NativeSelectField
                id="d-payform"
                label="Payment form"
                defaultValue="transfer"
                options={[
                  { value: "transfer", label: "Bank transfer" },
                  { value: "cash", label: "Cash" },
                  { value: "card", label: "Card" },
                ]}
              />
              <ComboboxField
                id="d-responsible"
                label="Responsible person"
                defaultValue="Jana Nováková"
                options={CONTACTS}
                className="sm:col-span-2"
              />
            </div>
          ),
        },
        {
          value: "accounting",
          label: "Accounting",
          content: (
            <div className={TWO_COL}>
              <SelectField
                id="a-ledger"
                label="Ledger account"
                defaultValue="311"
                options={[
                  { value: "311", label: "311 — Receivables" },
                  { value: "604", label: "604 — Goods revenue" },
                ]}
              />
              <SelectField
                id="a-vat"
                label="VAT regime"
                defaultValue="standard"
                options={[
                  { value: "standard", label: "Standard" },
                  { value: "reverse", label: "Reverse charge" },
                  { value: "exempt", label: "Exempt" },
                ]}
              />
              <NativeSelectField
                id="a-template"
                label="Posting template"
                defaultValue="sales"
                options={[
                  { value: "sales", label: "Domestic sales" },
                  { value: "eu", label: "EU supply" },
                  { value: "export", label: "Export" },
                ]}
              />
              <AddonField
                id="a-coef"
                label="VAT coefficient"
                defaultValue="100"
                addon="%"
              />
            </div>
          ),
        },
        {
          value: "other",
          label: "Other",
          content: (
            <div className="grid grid-cols-1 gap-4">
              <Field>
                <FieldLabel htmlFor="o-note">Internal note</FieldLabel>
                <Textarea
                  id="o-note"
                  rows={4}
                  defaultValue="Standing order, delivered on the 12th."
                />
              </Field>
              <Field>
                <FieldLabel>Tags</FieldLabel>
                <TagsField defaultValue={["recurring", "priority"]} />
              </Field>
            </div>
          ),
        },
        {
          value: "payment",
          label: "Payment details",
          content: (
            <div className={TWO_COL}>
              <SelectField
                id="p-method"
                label="Payment method"
                defaultValue="transfer"
                options={[
                  { value: "transfer", label: "Bank transfer" },
                  { value: "cash", label: "Cash" },
                  { value: "card", label: "Card" },
                ]}
              />
              <TextField id="p-account" label="Bank account" defaultValue="—" />
              <TextField
                id="p-iban"
                label="IBAN"
                defaultValue="CZ65 9999 0000 0000 1234 5670"
                className="sm:col-span-2"
              />
              <AddonField
                id="p-amount"
                label="Amount paid"
                defaultValue="0"
                addon="Kč"
              />
              <DateField id="p-date" label="Payment date" />
            </div>
          ),
        },
      ]}
    />
  )
}

/** Tags editor — a small local-state wrapper around `input-tags`. */
function TagsField({ defaultValue }: { defaultValue: string[] }) {
  const [tags, setTags] = React.useState(defaultValue)
  return (
    <InputTags value={tags} onValueChange={setTags}>
      <InputTagsList>
        {tags.map((tag) => (
          <InputTagsItem key={tag} value={tag}>
            {tag}
          </InputTagsItem>
        ))}
        <InputTagsInput placeholder="Add tag…" />
      </InputTagsList>
    </InputTags>
  )
}

/* -------------------------------------------------------------------------- */
/* Middle panel — Party                                                       */
/* -------------------------------------------------------------------------- */

function PartyPanel() {
  return (
    <Panel
      title="Party"
      defaultTab="company"
      tabs={[
        {
          value: "company",
          label: "Company",
          content: (
            <div className="grid grid-cols-1 gap-4">
              <ComboboxField
                id="c-company"
                label="Company"
                defaultValue="Acme s.r.o."
                options={COMPANIES}
              />
              <TextField
                id="c-street"
                label="Street"
                defaultValue="Vodičkova 700/32"
              />
              <div className="grid grid-cols-[120px_1fr] gap-4">
                <TextField id="c-zip" label="ZIP" defaultValue="110 00" />
                <TextField id="c-city" label="City" defaultValue="Praha 1" />
              </div>
              <NativeSelectField
                id="c-country"
                label="Country"
                defaultValue="CZ"
                options={[
                  { value: "CZ", label: "Czech Republic" },
                  { value: "SK", label: "Slovakia" },
                  { value: "DE", label: "Germany" },
                ]}
              />
              <div className="grid grid-cols-2 gap-4">
                <TextField id="c-ico" label="IČO" defaultValue="—" />
                <TextField id="c-dic" label="DIČ" defaultValue="—" />
              </div>
              <Field>
                <FieldLabel htmlFor="c-desc">Description</FieldLabel>
                <Textarea
                  id="c-desc"
                  rows={3}
                  placeholder="Notes about this company…"
                />
              </Field>
            </div>
          ),
        },
        {
          value: "delivery",
          label: "Delivery",
          content: (
            <div className="grid grid-cols-1 gap-4">
              <TextField
                id="dl-street"
                label="Delivery street"
                defaultValue="Vodičkova 700/32"
              />
              <div className="grid grid-cols-[120px_1fr] gap-4">
                <TextField id="dl-zip" label="ZIP" defaultValue="110 00" />
                <TextField id="dl-city" label="City" defaultValue="Praha 1" />
              </div>
              <NativeSelectField
                id="dl-carrier"
                label="Carrier"
                defaultValue="pickup"
                options={[
                  { value: "pickup", label: "Personal pickup" },
                  { value: "ppl", label: "PPL" },
                  { value: "dpd", label: "DPD" },
                ]}
              />
              <DateField
                id="dl-date"
                label="Delivery date"
                defaultDate={new Date(2026, 5, 12)}
              />
            </div>
          ),
        },
        {
          value: "overview",
          label: "Overview",
          content: (
            <KeyValue
              readOnly
              value={[
                { id: "balance", key: "Balance", value: "12 480 Kč" },
                { id: "last", key: "Last invoice", value: "VF3-0044/2026" },
                { id: "limit", key: "Credit limit", value: "50 000 Kč" },
              ]}
            >
              <KeyValueList>
                <KeyValueItem>
                  <KeyValueKeyInput readOnly className="bg-muted/40" />
                  <KeyValueValueInput readOnly className="bg-muted/40" />
                </KeyValueItem>
              </KeyValueList>
            </KeyValue>
          ),
        },
        {
          value: "contact",
          label: "Contact",
          content: (
            <div className="grid grid-cols-1 gap-4">
              <ComboboxField
                id="ct-person"
                label="Contact person"
                defaultValue="Petr Svoboda"
                options={CONTACTS}
              />
              <TextField
                id="ct-email"
                label="Email"
                type="email"
                defaultValue="petr.svoboda@acme.cz"
              />
              <Field>
                <FieldLabel htmlFor="ct-phone">Phone</FieldLabel>
                <PhoneInput id="ct-phone" defaultValue="+420776123456" />
              </Field>
            </div>
          ),
        },
      ]}
    />
  )
}

/* -------------------------------------------------------------------------- */
/* Right panel — Amounts                                                      */
/* -------------------------------------------------------------------------- */

/** The read-only per-rate VAT recap table, derived live from the grid rows. */
function VatRecapTable({ rows }: { rows: LineRow[] }) {
  const recap = React.useMemo(() => vatRecap(rows), [rows])
  const totals = React.useMemo(() => ledgerTotals(rows), [rows])
  const cell = "text-right tabular-nums"
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="text-muted-foreground">Rate</TableHead>
          <TableHead className={cn(cell, "text-muted-foreground")}>
            Base [Kč]
          </TableHead>
          <TableHead className={cn(cell, "text-muted-foreground")}>
            VAT [Kč]
          </TableHead>
          <TableHead className={cn(cell, "text-muted-foreground")}>
            Total incl. VAT [Kč]
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {recap.map((r) => (
          <TableRow key={r.rate} className="hover:bg-transparent">
            <TableCell>{r.rate} %</TableCell>
            <TableCell className={cell}>{formatNum(r.base)}</TableCell>
            <TableCell className={cell}>{formatNum(r.vat)}</TableCell>
            <TableCell className={cell}>{formatNum(r.total)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter className="bg-transparent">
        <TableRow className="hover:bg-transparent">
          <TableCell>Σ</TableCell>
          <TableCell className={cell}>{formatNum(totals.base)}</TableCell>
          <TableCell className={cell}>{formatNum(totals.vat)}</TableCell>
          <TableCell className={cell}>{formatNum(totals.total)}</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  )
}

/** A zero VAT recap table (foreign-currency tab: all `0.00` for CZK). */
function ZeroRecapTable() {
  const cell = "text-right tabular-nums"
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="text-muted-foreground">Rate</TableHead>
          <TableHead className={cn(cell, "text-muted-foreground")}>
            Base [Kč]
          </TableHead>
          <TableHead className={cn(cell, "text-muted-foreground")}>
            VAT [Kč]
          </TableHead>
          <TableHead className={cn(cell, "text-muted-foreground")}>
            Total incl. VAT [Kč]
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {["21", "12", "0"].map((rate) => (
          <TableRow key={rate} className="hover:bg-transparent">
            <TableCell>{rate} %</TableCell>
            <TableCell className={cell}>0.00</TableCell>
            <TableCell className={cell}>0.00</TableCell>
            <TableCell className={cell}>0.00</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter className="bg-transparent">
        <TableRow className="hover:bg-transparent">
          <TableCell>Σ</TableCell>
          <TableCell className={cell}>0.00</TableCell>
          <TableCell className={cell}>0.00</TableCell>
          <TableCell className={cell}>0.00</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  )
}

function AmountsPanel({ rows }: { rows: LineRow[] }) {
  return (
    <Panel
      title="Amounts"
      defaultTab="local"
      tabs={[
        {
          value: "local",
          label: "Local currency",
          content: (
            <div className="grid grid-cols-1 gap-4">
              <div className="grid grid-cols-2 gap-4">
                <AddonField
                  id="am-discount"
                  label="Discount"
                  defaultValue="0"
                  addon="%"
                />
                <NativeSelectField
                  id="am-currency"
                  label="Currency"
                  defaultValue="CZK"
                  options={[
                    { value: "CZK", label: "CZK" },
                    { value: "EUR", label: "EUR" },
                    { value: "USD", label: "USD" },
                  ]}
                />
              </div>
              <VatRecapTable rows={rows} />
            </div>
          ),
        },
        {
          value: "foreign",
          label: "Foreign currency",
          content: (
            <div className="grid grid-cols-1 gap-4">
              <div className="grid grid-cols-2 gap-4">
                <TextField
                  id="am-rate"
                  label="Exchange rate"
                  defaultValue="1.00"
                />
                <DateField id="am-ratedate" label="Rate date" />
              </div>
              <ZeroRecapTable />
            </div>
          ),
        },
        {
          value: "intrastat",
          label: "Intrastat",
          content: (
            <div className="grid grid-cols-1 gap-4">
              <NativeSelectField
                id="in-type"
                label="Transaction type"
                defaultValue="11"
                options={[
                  { value: "11", label: "11 — Outright purchase/sale" },
                  { value: "12", label: "12 — Consignment" },
                  { value: "31", label: "31 — Processing" },
                ]}
              />
              <AddonField
                id="in-weight"
                label="Weight"
                defaultValue="0"
                addon="kg"
              />
              <AddonField
                id="in-statvalue"
                label="Statistical value"
                defaultValue="0"
                addon="Kč"
              />
            </div>
          ),
        },
      ]}
    />
  )
}

/* -------------------------------------------------------------------------- */
/* Line items                                                                 */
/* -------------------------------------------------------------------------- */

let lineSeq = 0

/**
 * The full-width line-items region — a labelled line toolbar above the real
 * editable `data-grid`. The parent owns the rows; New / Duplicate / Delete
 * mutate that state, and inline editing flows back through `onRowsChange`, so
 * the VAT recap table + the status bar always reconcile.
 */
function LineItemsRegion({
  rows,
  onRowsChange,
}: {
  rows: LineRow[]
  onRowsChange: (rows: LineRow[]) => void
}) {
  const addRow = () => {
    onRowsChange([
      ...rows,
      recomputeLine({
        id: `new-${(lineSeq += 1)}`,
        code: "",
        warehouse: "MAIN",
        name: "New item",
        qty: 1,
        unit: "pc",
        unitPrice: 0,
        base: 0,
        vatRate: "21",
        total: 0,
      }),
    ])
    toast.success("Line added")
  }
  const duplicateLast = () => {
    const last = rows[rows.length - 1]
    if (!last) return
    onRowsChange([...rows, { ...last, id: `new-${(lineSeq += 1)}` }])
    toast.success("Line duplicated")
  }
  const deleteLast = () => {
    if (rows.length === 0) return
    onRowsChange(rows.slice(0, -1))
    toast.success("Line removed")
  }

  return (
    <div className="flex flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border-subtle px-3 py-1.5">
        <span className="mr-2 text-xs font-medium text-muted-foreground">
          Line items
        </span>
        <Button variant="ghost" size="sm" onClick={addRow}>
          <Plus />
          New
        </Button>
        <Button variant="ghost" size="sm" onClick={duplicateLast}>
          <Copy />
          Duplicate
        </Button>
        <Button variant="ghost" size="sm" onClick={deleteLast}>
          <X />
          Cancel line
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => toast.success("Import from Excel…")}
        >
          <Upload />
          Import from Excel
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => toast.success("Barcode scanner…")}
        >
          <ScanLine />
          Barcode scanner
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => toast.success("Bulk changes…")}
        >
          <Pencil />
          Bulk changes
        </Button>
      </div>
      <div className="p-3">
        <LineItemsGrid rows={rows} onRowsChange={onRowsChange} />
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Single archetype demo                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Single archetype demo (#425) — an ABRA-style record workspace for an issued
 * invoice. Three side-by-side panels (Document / Party / Amounts), each with its
 * OWN local tab strip, sit above a full-width editable line-items grid (no
 * single top-level content-header tab strip). The right panel's VAT recap table
 * and the ContentStatusBar totals both derive live from the editable rows.
 */
export function SingleDemo() {
  const [rows, setRows] = React.useState<LineRow[]>(LINE_ITEMS)
  const totals = React.useMemo(() => ledgerTotals(rows), [rows])

  const toolbar = (
    <ContentToolbar
      left={
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-foreground">Editing</span>
          <Badge variant="secondary" className="h-5">
            Draft
          </Badge>
        </div>
      }
      right={
        <>
          <IconButton
            icon="Copy"
            aria-label="Duplicate document"
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
        </>
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
              {formatNum(totals.base)} Kč
            </span>
          </span>
          <span>
            <span className="text-muted-foreground">VAT</span>{" "}
            <span className="font-medium text-foreground">
              {formatNum(totals.vat)} Kč
            </span>
          </span>
          <span>
            <span className="text-muted-foreground">Total</span>{" "}
            <span className="font-semibold text-foreground">
              {formatNum(totals.total)} Kč
            </span>
          </span>
        </div>
      }
      right={
        <span className="text-muted-foreground">
          {rows.length} {rows.length === 1 ? "line" : "lines"}
        </span>
      }
    />
  )

  return (
    <>
      <AppPageHeader>
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
          actions={
            <>
              <Badge variant="destructive" className="h-5">
                Overdue
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="h-7"
                onClick={() => toast("Deliveries")}
              >
                Deliveries
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7"
                onClick={() => toast("Received orders")}
              >
                Received orders
              </Button>
              <IconButton
                icon="ChevronUp"
                aria-label="Previous record"
                tooltip="Previous"
                tooltipSide="bottom"
                onClick={() => toast("Previous record")}
              />
              <IconButton
                icon="ChevronDown"
                aria-label="Next record"
                tooltip="Next"
                tooltipSide="bottom"
                onClick={() => toast("Next record")}
              />
              <IconButton
                icon="Settings2"
                aria-label="Configure"
                tooltip="Configure"
                tooltipSide="bottom"
              />
            </>
          }
        />
      </AppPageHeader>
      <ContentPanel
        bodyClassName="flex min-h-0 flex-col p-0"
        toolbar={toolbar}
        statusBar={statusBar}
      >
        <RecordWorkspace
          formLayout="panels"
          lineItems={<LineItemsRegion rows={rows} onRowsChange={setRows} />}
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={() => toast("Closed")}>
                Close
              </Button>
              <ButtonGroup>
                <Button size="sm" onClick={() => toast.success("Record saved")}>
                  Save
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" aria-label="More save options">
                      <ChevronDown />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => toast.success("Record saved")}
                    >
                      Save
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => toast.success("Saved — new record")}
                    >
                      Save and new
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => toast.success("Saved and closed")}
                    >
                      Save and close
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </ButtonGroup>
            </>
          }
        >
          <DocumentPanel />
          <PartyPanel />
          <AmountsPanel rows={rows} />
        </RecordWorkspace>
      </ContentPanel>
    </>
  )
}
