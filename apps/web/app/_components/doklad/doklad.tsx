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

import { formatAmount, formatDecimal } from "../_shared/accounting-format"
import { DokladProvider, useDoklad } from "./context"
import {
  COMPANIES,
  CONTACTS,
  recomputeLine,
  vatRecap,
  type DokladHeader,
  type DokladParty,
} from "./data"
import { DokladHeader as DokladContentHeader } from "./doklad-header"
import { LineItemsGrid, type LineRow } from "./line-items"

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

/** A labelled date field — a real Popover + Calendar picker. */
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
              <span className="text-muted-foreground">Vyberte datum</span>
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
        <ComboboxInput id={id} placeholder="Hledat…" className="w-full" />
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

/** A labelled input-group with a trailing text addon (`%`, `Kč`). */
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
 * tab's field grid. The three panels (Doklad / Partner / Částky) each own an
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

/** Parse an ISO date string into a `Date` for the calendar picker default. */
function isoToDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number)
  return year && month && day ? new Date(year, month - 1, day) : new Date(iso)
}

/* -------------------------------------------------------------------------- */
/* Left panel — Doklad (Document)                                             */
/* -------------------------------------------------------------------------- */

function DocumentPanel({ header }: { header: DokladHeader }) {
  return (
    <Panel
      title="Doklad"
      defaultTab="header"
      tabs={[
        {
          value: "header",
          label: "Hlavička",
          content: (
            <div className={TWO_COL}>
              <SelectField
                id="d-type"
                label="Typ dokladu"
                defaultValue="received"
                className="sm:col-span-2"
                options={[
                  { value: "received", label: "Faktura přijatá" },
                  { value: "advance", label: "Zálohová faktura" },
                  { value: "credit", label: "Opravný daňový doklad" },
                ]}
              />
              <TextField
                id="d-number"
                label="Číslo dokladu"
                defaultValue={header.number}
              />
              <TextField
                id="d-vs"
                label="Variabilní symbol"
                defaultValue={header.variableSymbol}
              />
              <DateField
                id="d-issued"
                label="Datum vystavení"
                defaultDate={isoToDate(header.issueDate)}
              />
              <DateField
                id="d-due"
                label="Datum splatnosti"
                defaultDate={isoToDate(header.dueDate)}
              />
              <DateField
                id="d-taxpoint"
                label="DUZP"
                defaultDate={isoToDate(header.taxPointDate)}
              />
              <NativeSelectField
                id="d-payform"
                label="Forma úhrady"
                defaultValue="transfer"
                options={[
                  { value: "transfer", label: "Převodem" },
                  { value: "cash", label: "Hotově" },
                  { value: "card", label: "Kartou" },
                ]}
              />
              <ComboboxField
                id="d-responsible"
                label="Odpovědná osoba"
                defaultValue="Jana Nováková"
                options={CONTACTS}
                className="sm:col-span-2"
              />
            </div>
          ),
        },
        {
          value: "accounting",
          label: "Zaúčtování",
          content: (
            <div className={TWO_COL}>
              <SelectField
                id="a-ledger"
                label="Účet"
                defaultValue="321"
                options={[
                  { value: "321", label: "321 — Dodavatelé" },
                  { value: "501", label: "501 — Spotřeba materiálu" },
                ]}
              />
              <SelectField
                id="a-vat"
                label="Režim DPH"
                defaultValue="standard"
                options={[
                  { value: "standard", label: "Standardní" },
                  { value: "reverse", label: "Přenesená daň. povinnost" },
                  { value: "exempt", label: "Osvobozeno" },
                ]}
              />
              <NativeSelectField
                id="a-template"
                label="Předkontace"
                defaultValue="purchase"
                options={[
                  { value: "purchase", label: "Tuzemský nákup" },
                  { value: "eu", label: "Pořízení z EU" },
                  { value: "import", label: "Dovoz" },
                ]}
              />
              <AddonField
                id="a-coef"
                label="Koeficient DPH"
                defaultValue="100"
                addon="%"
              />
            </div>
          ),
        },
        {
          value: "payment",
          label: "Úhrada",
          content: (
            <div className={TWO_COL}>
              <SelectField
                id="p-method"
                label="Způsob úhrady"
                defaultValue="transfer"
                options={[
                  { value: "transfer", label: "Převodem" },
                  { value: "cash", label: "Hotově" },
                  { value: "card", label: "Kartou" },
                ]}
              />
              <TextField
                id="p-account"
                label="Bankovní účet"
                defaultValue="—"
              />
              <TextField
                id="p-iban"
                label="IBAN"
                defaultValue="CZ65 9999 0000 0000 1234 5670"
                className="sm:col-span-2"
              />
              <AddonField
                id="p-amount"
                label="Uhrazeno"
                defaultValue="0"
                addon="Kč"
              />
              <DateField id="p-date" label="Datum úhrady" />
            </div>
          ),
        },
      ]}
    />
  )
}

/* -------------------------------------------------------------------------- */
/* Middle panel — Partner (Party)                                            */
/* -------------------------------------------------------------------------- */

function PartyPanel({ party }: { party: DokladParty }) {
  return (
    <Panel
      title="Partner"
      defaultTab="company"
      tabs={[
        {
          value: "company",
          label: "Firma",
          content: (
            <div className="grid grid-cols-1 gap-4">
              <ComboboxField
                id="c-company"
                label="Firma"
                defaultValue={party.name}
                options={COMPANIES}
              />
              <TextField
                id="c-street"
                label="Ulice"
                defaultValue={party.street}
              />
              <div className="grid grid-cols-[120px_1fr] gap-4">
                <TextField id="c-zip" label="PSČ" defaultValue={party.zip} />
                <TextField
                  id="c-city"
                  label="Město"
                  defaultValue={party.city}
                />
              </div>
              <NativeSelectField
                id="c-country"
                label="Stát"
                defaultValue={party.country}
                options={[
                  { value: "CZ", label: "Česká republika" },
                  { value: "SK", label: "Slovensko" },
                  { value: "DE", label: "Německo" },
                ]}
              />
              <div className="grid grid-cols-2 gap-4">
                <TextField id="c-ico" label="IČO" defaultValue={party.ico} />
                <TextField id="c-dic" label="DIČ" defaultValue={party.dic} />
              </div>
              <Field>
                <FieldLabel htmlFor="c-desc">Popis</FieldLabel>
                <Textarea
                  id="c-desc"
                  rows={3}
                  placeholder="Poznámky k této firmě…"
                />
              </Field>
            </div>
          ),
        },
        {
          value: "contact",
          label: "Kontakt",
          content: (
            <div className="grid grid-cols-1 gap-4">
              <ComboboxField
                id="ct-person"
                label="Kontaktní osoba"
                defaultValue="Petr Svoboda"
                options={CONTACTS}
              />
              <TextField
                id="ct-email"
                label="E-mail"
                type="email"
                defaultValue="fakturace@kavovazasoba.cz"
              />
              <TextField
                id="ct-phone"
                label="Telefon"
                defaultValue="+420 776 123 456"
              />
            </div>
          ),
        },
      ]}
    />
  )
}

/* -------------------------------------------------------------------------- */
/* Right panel — Částky (Amounts)                                            */
/* -------------------------------------------------------------------------- */

/** The read-only per-rate VAT recap table, derived live from the grid rows. */
function VatRecapTable({ rows }: { rows: LineRow[] }) {
  const recap = React.useMemo(() => vatRecap(rows), [rows])
  const totals = React.useMemo(
    () => ({
      base: rows.reduce((s, r) => s + r.base, 0),
      vat: rows.reduce((s, r) => s + r.vat, 0),
      total: rows.reduce((s, r) => s + r.total, 0),
    }),
    [rows],
  )
  const cell = "text-right tabular-nums"
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="text-muted-foreground">Sazba</TableHead>
          <TableHead className={cn(cell, "text-muted-foreground")}>
            Základ
          </TableHead>
          <TableHead className={cn(cell, "text-muted-foreground")}>
            DPH
          </TableHead>
          <TableHead className={cn(cell, "text-muted-foreground")}>
            Celkem s DPH
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {recap.map((r) => (
          <TableRow key={r.rate} className="hover:bg-transparent">
            <TableCell>{r.rate} %</TableCell>
            <TableCell className={cell}>{formatDecimal(r.base)}</TableCell>
            <TableCell className={cell}>{formatDecimal(r.vat)}</TableCell>
            <TableCell className={cell}>{formatDecimal(r.total)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter className="bg-transparent">
        <TableRow className="hover:bg-transparent">
          <TableCell>Σ</TableCell>
          <TableCell className={cell}>{formatAmount(totals.base)}</TableCell>
          <TableCell className={cell}>{formatAmount(totals.vat)}</TableCell>
          <TableCell className={cell}>{formatAmount(totals.total)}</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  )
}

function AmountsPanel({
  rows,
  currency,
}: {
  rows: LineRow[]
  currency: string
}) {
  return (
    <Panel
      title="Částky"
      defaultTab="local"
      tabs={[
        {
          value: "local",
          label: "Domácí měna",
          content: (
            <div className="grid grid-cols-1 gap-4">
              <div className="grid grid-cols-2 gap-4">
                <AddonField
                  id="am-discount"
                  label="Sleva"
                  defaultValue="0"
                  addon="%"
                />
                <NativeSelectField
                  id="am-currency"
                  label="Měna"
                  defaultValue={currency}
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
          label: "Cizí měna",
          content: (
            <div className="grid grid-cols-1 gap-4">
              <div className="grid grid-cols-2 gap-4">
                <TextField id="am-rate" label="Kurz" defaultValue="1.00" />
                <DateField id="am-ratedate" label="Datum kurzu" />
              </div>
              <p className="text-sm text-muted-foreground">
                Doklad je v domácí měně (CZK), přepočet se neuplatní.
              </p>
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
 * editable `data-grid`. The parent owns the rows; New / Duplicate / Cancel
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
        name: "Nová položka",
        qty: 1,
        unit: "pc",
        unitPrice: 0,
        base: 0,
        vat: 0,
        vatRate: "21",
        total: 0,
      }),
    ])
    toast.success("Řádek přidán")
  }
  const duplicateLast = () => {
    const last = rows[rows.length - 1]
    if (!last) return
    onRowsChange([...rows, { ...last, id: `new-${(lineSeq += 1)}` }])
    toast.success("Řádek zkopírován")
  }
  const deleteLast = () => {
    if (rows.length === 0) return
    onRowsChange(rows.slice(0, -1))
    toast.success("Řádek zrušen")
  }

  return (
    <div className="flex flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border-subtle px-3 py-1.5">
        <span className="mr-2 text-xs font-medium text-muted-foreground">
          Položky dokladu
        </span>
        <Button variant="ghost" size="sm" onClick={addRow}>
          <Plus />
          Nový
        </Button>
        <Button variant="ghost" size="sm" onClick={duplicateLast}>
          <Copy />
          Kopírovat
        </Button>
        <Button variant="ghost" size="sm" onClick={deleteLast}>
          <X />
          Zrušit řádek
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => toast.success("Import z Excelu…")}
        >
          <Upload />
          Import z Excelu
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => toast.success("Čtečka čárových kódů…")}
        >
          <ScanLine />
          Čtečka kódů
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => toast.success("Hromadné změny…")}
        >
          <Pencil />
          Hromadné změny
        </Button>
      </div>
      <div className="p-3">
        <LineItemsGrid rows={rows} onRowsChange={onRowsChange} />
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* The record workspace body — reads the shared doklad state                  */
/* -------------------------------------------------------------------------- */

function DokladBody() {
  const { header, party, rows, setRows, totals } = useDoklad()

  const toolbar = (
    <ContentToolbar
      left={
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-foreground">Úpravy</span>
          <Badge variant="secondary" className="h-5">
            Rozpracováno
          </Badge>
        </div>
      }
      right={
        <>
          <IconButton
            icon="Copy"
            aria-label="Kopírovat doklad"
            tooltip="Kopírovat"
            tooltipSide="bottom"
            onClick={() => toast.success("Doklad zkopírován")}
          />
          <IconButton
            icon="Download"
            aria-label="Export"
            tooltip="Export"
            tooltipSide="bottom"
            onClick={() => toast.success("Exportuji doklad…")}
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
            <span className="text-muted-foreground">Základ</span>{" "}
            <span className="font-medium text-foreground">
              {formatDecimal(totals.base)}
            </span>
          </span>
          <span>
            <span className="text-muted-foreground">DPH</span>{" "}
            <span className="font-medium text-foreground">
              {formatDecimal(totals.vat)}
            </span>
          </span>
          <span>
            <span className="text-muted-foreground">Celkem</span>{" "}
            <span className="font-semibold text-foreground">
              {formatDecimal(totals.total)}
            </span>
          </span>
        </div>
      }
      right={
        <span className="text-muted-foreground">
          {rows.length} {rows.length === 1 ? "položka" : "položek"}
        </span>
      }
    />
  )

  return (
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
            <Button variant="ghost" size="sm" onClick={() => toast("Zavřeno")}>
              Zavřít
            </Button>
            <ButtonGroup>
              {/* TODO(epic4-wire): capture/post SDK call. */}
              <Button size="sm" onClick={() => toast.success("Doklad uložen")}>
                Uložit
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" aria-label="Další možnosti uložení">
                    <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => toast.success("Doklad uložen")}
                  >
                    Uložit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => toast.success("Uloženo — nový doklad")}
                  >
                    Uložit a nový
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => toast.success("Uloženo a zavřeno")}
                  >
                    Uložit a zavřít
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </ButtonGroup>
          </>
        }
      >
        <DocumentPanel header={header} />
        <PartyPanel party={party} />
        <AmountsPanel rows={rows} currency={header.currency} />
      </RecordWorkspace>
    </ContentPanel>
  )
}

/* -------------------------------------------------------------------------- */
/* Doklad (invoice/document) editor                                           */
/* -------------------------------------------------------------------------- */

/**
 * The doklad editor — an ABRA-style record workspace for a Czech received
 * invoice (faktura přijatá). Three side-by-side panels (Doklad / Partner /
 * Částky), each with its OWN local tab strip, sit above a full-width editable
 * line-items grid. The Amounts panel's VAT recap table and the
 * ContentStatusBar totals both derive live from the editable rows, held in the
 * shared `DokladProvider` state.
 *
 * TODO(epic4-wire): capture/post SDK call — the fixture in `./data.ts` stands in
 * for the generated SDK read/write once the document endpoints are live.
 */
export function Doklad() {
  return (
    <DokladProvider>
      <DokladContentHeader />
      <DokladBody />
    </DokladProvider>
  )
}
