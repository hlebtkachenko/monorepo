"use client"

import * as React from "react"
import type { Table } from "@tanstack/react-table"

import { ArchetypeTable } from "@workspace/ui/blocks/archetypes"
import { type InspectorTab } from "@workspace/ui/blocks/inspector-sheet"
import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import {
  SectionList,
  sectionInspectorActivityLog,
  sectionInspectorAttachments,
  sectionInspectorExport,
  sectionInspectorKeyDetails,
  sectionInspectorLinkedRecords,
  sectionInspectorMoneyTotals,
  sectionInspectorParagraph,
  sectionInspectorTable,
  sectionTable,
} from "@workspace/ui/blocks/content-panel"
import type {
  ContentHeaderFavoriteToggle,
  ContentToolbarProps,
  DetailsTableColumn,
  DetailsTableRow,
  SectionDescriptor,
  TableColumnSpec,
  TableSectionRow,
  ViewTab,
} from "@workspace/ui/blocks/content-panel"
import {
  createColumnConfigHelper,
  dateFilterFn,
  multiOptionFilterFn,
  numberFilterFn,
  optionFilterFn,
  textFilterFn,
  useFilterBar,
  type FilterModel,
  type FiltersState,
} from "@workspace/ui/components/filter-bar"
import { toast } from "@workspace/ui/components/sonner"

import { useInspectorAttachments } from "../../../../_lib/use-inspector-attachments"
import {
  BaselineIcon,
  Calculator,
  CalendarIcon,
  ListChecksIcon,
  ListIcon,
} from "@workspace/ui/lib/icons"

import { INVOICE_ROWS, INVOICE_STATUS_OPTIONS, INVOICE_TABS } from "./fixture"

// A small tag pool so the multiOption filter has data; tags live on each row as
// a comma-joined string (TableCellValue is scalar) and are split back into an
// array by the filter accessor + applier.
const TAG_POOL = [
  { value: "priority", label: "Priority" },
  { value: "review", label: "Review" },
  { value: "recurring", label: "Recurring" },
  { value: "foreign", label: "Foreign currency" },
]

/** Deterministic tag subset per row index (some rows get none). */
function tagsForRow(index: number): string {
  return TAG_POOL.filter((_, i) => (index + i) % 3 === 0)
    .map((tag) => tag.value)
    .join(",")
}

// Distinct invoice kinds present in the data → option-filter choices.
const KIND_OPTIONS = Array.from(
  new Set(INVOICE_ROWS.map((row) => row.kind)),
).map((kind) => ({
  value: kind,
  label: kind.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()),
}))

// Demo rows as pure data (Record keyed by column id). `date` stays ISO so the
// date filter can parse it; `tags` is comma-joined (see TAG_POOL). The source
// set is tripled (unique ids) so the grid overflows and the sticky header +
// row scrolling are visible.
const DEMO_ROWS: TableSectionRow[] = Array.from({ length: 3 }, (_, copy) =>
  INVOICE_ROWS.map((row, index) => ({
    id: copy === 0 ? row.id : `${row.id}-${copy}`,
    document: copy === 0 ? row.document : `${row.document}-${copy + 1}`,
    partner: row.partner,
    status: row.status,
    amount: row.amount,
    vat: row.vat,
    date: row.date,
    kind: row.kind,
    tags: tagsForRow(index + copy * INVOICE_ROWS.length),
  })),
).flat()

const STATUS_OPTIONS = INVOICE_STATUS_OPTIONS.map((o) => ({
  value: o.value,
  label: o.label,
}))

// View tabs with mandatory count badges; the first ("All") is the mandatory view.
const VIEW_TABS: ViewTab[] = INVOICE_TABS.map((tab) => ({
  value: tab.value,
  label: tab.label,
  count: tab.kind
    ? DEMO_ROWS.filter((row) => row.kind === tab.kind).length
    : DEMO_ROWS.length,
}))

// Pure-data column specs — the renderer maps each to OUR shadcn cell/editor.
const COLUMNS: TableColumnSpec[] = [
  {
    id: "document",
    header: "Document",
    kind: "text",
    role: "id",
    edit: "inline",
    pin: "left",
    width: 170,
  },
  {
    id: "partner",
    header: "Partner",
    kind: "text",
    edit: "inline",
    width: 200,
  },
  {
    id: "status",
    header: "Status",
    kind: "select",
    edit: "inline",
    enableFilter: true,
    options: STATUS_OPTIONS,
    width: 150,
  },
  {
    id: "amount",
    header: "Amount",
    kind: "number",
    edit: "inline",
    align: "end",
    width: 130,
  },
  { id: "vat", header: "VAT", kind: "number", align: "end", width: 110 },
  { id: "date", header: "Date", kind: "text", width: 140 },
  {
    id: "kind",
    header: "Kind",
    kind: "select",
    options: KIND_OPTIONS,
    width: 150,
  },
  { id: "tags", header: "Tags", kind: "text", width: 180 },
]

const ADD_TYPES = ["Tax document", "Advance", "Credit note", "Settlement"]

// Multi-filter (bazza) columns for the toolbar `filter` slot. RULE: every table
// column is filterable here EXCEPT the one delegated to the faceted statusFilter
// ("status"). So this mirrors COLUMNS minus `status`, with one entry per
// supported filter type — text · number · date · option · multiOption. `client`
// strategy: we apply the resulting FiltersState to the rows ourselves (external
// pre-filter), mirroring the view-tab narrowing.
const filterHelper = createColumnConfigHelper<TableSectionRow>()
const FILTER_COLUMNS = [
  filterHelper
    .text()
    .id("document")
    .accessor((row) => String(row.document ?? ""))
    .displayName("Document")
    .icon(BaselineIcon)
    .build(),
  filterHelper
    .text()
    .id("partner")
    .accessor((row) => String(row.partner ?? ""))
    .displayName("Partner")
    .icon(BaselineIcon)
    .build(),
  filterHelper
    .number()
    .id("amount")
    .accessor((row) => Number(row.amount ?? 0))
    .displayName("Amount")
    .icon(Calculator)
    .build(),
  filterHelper
    .number()
    .id("vat")
    .accessor((row) => Number(row.vat ?? 0))
    .displayName("VAT")
    .icon(Calculator)
    .build(),
  filterHelper
    .date()
    .id("date")
    .accessor((row) => new Date(String(row.date ?? "")))
    .displayName("Date")
    .icon(CalendarIcon)
    .build(),
  filterHelper
    .option()
    .id("kind")
    .accessor((row) => String(row.kind ?? ""))
    .displayName("Kind")
    .icon(ListIcon)
    .options(KIND_OPTIONS)
    .build(),
  filterHelper
    .multiOption()
    .id("tags")
    .accessor((row) =>
      String(row.tags ?? "")
        .split(",")
        .filter(Boolean),
    )
    .displayName("Tags")
    .icon(ListChecksIcon)
    .options(TAG_POOL)
    .build(),
] as const

/** Apply the active multi-filter chips to a row (client strategy). */
function matchesFilters(row: TableSectionRow, filters: FiltersState): boolean {
  return filters.every((filter) => {
    const raw = row[filter.columnId]
    switch (filter.type) {
      case "text":
        return textFilterFn(String(raw ?? ""), filter as FilterModel<"text">)
      case "number":
        return numberFilterFn(Number(raw ?? 0), filter as FilterModel<"number">)
      case "date":
        return dateFilterFn(
          new Date(String(raw ?? "")),
          filter as FilterModel<"date">,
        )
      case "option":
        return optionFilterFn(
          String(raw ?? ""),
          filter as FilterModel<"option">,
        )
      case "multiOption":
        return multiOptionFilterFn(
          String(raw ?? "")
            .split(",")
            .filter(Boolean),
          filter as FilterModel<"multiOption">,
        )
      default:
        return true
    }
  })
}

/**
 * Client view for the Archetype Table debug page — the **Table** archetype with a
 * real TanStack-backed **Table section** (demo invoice rows). The section owns the
 * live grid (sort · resize · reorder · pin · select · inline edit) and publishes
 * it up through the archetype's bridge, so the toolbar's Columns/Sort + faceted
 * Status filter + universal search + the selection footer all drive the SAME
 * grid. Branded section descriptors are minted inside this client boundary.
 *
 * The view tabs pre-filter the rows by invoice `kind` (external); Status + Search
 * filter within the table (internal, no reseed). The multi-filter (Add filter)
 * covers every table column except `status` (delegated to the faceted filter),
 * one per supported type — text/number/date/option/multiOption — and pre-filters
 * the rows. The per-row maximize affordance opens the empty row Inspector rail.
 * NOT wired for v1: Inspector content or Save/Discard harvest.
 */
/** Group a major-unit amount for a details-table cell (currency shown in Totals). */
const num = (major: number): string =>
  new Intl.NumberFormat("cs-CZ").format(major)

const PAYMENT_OPTIONS = [
  { value: "transfer", label: "Bank transfer" },
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
]

// Invoice lines (partial_record) — the record's own detail, rendered "bigger":
// a read-only Details Table with per-line quantity, unit price, base and VAT
// across all 6 tracks (description spans 2).
const INVOICE_ITEM_COLUMNS: DetailsTableColumn[] = [
  { id: "desc", header: "Description", span: 2, control: { kind: "text" } },
  {
    id: "qty",
    header: "Qty",
    span: 1,
    align: "end",
    control: { kind: "text" },
  },
  {
    id: "unit",
    header: "Unit",
    span: 1,
    align: "end",
    control: { kind: "text" },
  },
  {
    id: "base",
    header: "Base",
    span: 1,
    align: "end",
    control: { kind: "text" },
  },
  {
    id: "vat",
    header: "VAT",
    span: 1,
    align: "end",
    control: { kind: "text" },
  },
]

// Debit/credit posting — also the shared Details Table (editable, structured).
const POSTING_COLUMNS: DetailsTableColumn[] = [
  { id: "account", header: "Account", span: 1, control: { kind: "text" } },
  { id: "name", header: "Name", span: 2, control: { kind: "text" } },
  {
    id: "debit",
    header: "Debit",
    span: 1,
    align: "end",
    control: { kind: "text" },
  },
  {
    id: "credit",
    header: "Credit",
    span: 1,
    align: "end",
    control: { kind: "text" },
  },
]

// Open items / accounts-payable ledger — an EDITABLE Related table.
const OPEN_ITEM_COLUMNS: DetailsTableColumn[] = [
  { id: "doc", header: "Document", span: 2, control: { kind: "text" } },
  {
    id: "vs",
    header: "VS",
    span: 1,
    control: { kind: "text", inputMode: "numeric" },
  },
  {
    id: "amount",
    header: "Amount",
    span: 1,
    align: "end",
    control: { kind: "text", inputMode: "numeric" },
  },
  {
    id: "remaining",
    header: "Remaining",
    span: 1,
    align: "end",
    control: { kind: "text", inputMode: "numeric" },
  },
]

/**
 * An Inspector tab body: a list of branded `inspector-*` section descriptors
 * rendered through the ONE Section registry (`SectionList`), divided by
 * full-width hairlines. No hand-placed section JSX — adding a section is pushing
 * another descriptor onto the list.
 */
function InspectorStack({ sections }: { sections: SectionDescriptor[] }) {
  return (
    <div className="flex flex-col gap-6">
      {sections.map((section, i) => (
        <React.Fragment key={i}>
          {i > 0 ? (
            <Separator className="-mx-4 w-auto bg-border-subtle" />
          ) : null}
          <SectionList sections={[section]} />
        </React.Fragment>
      ))}
    </div>
  )
}

/** The "More" tab — the secondary actions the header ⋯ used to hold. Raw. */
function MoreActions() {
  const actions = [
    { label: "Duplicate", run: () => toast.success("Duplicate (demo)") },
    { label: "Move to…", run: () => toast.success("Move (demo)") },
    { label: "Archive", run: () => toast.success("Archive (demo)") },
  ]
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        {actions.map((action) => (
          <Button
            key={action.label}
            variant="ghost"
            className="justify-start"
            onClick={action.run}
          >
            {action.label}
          </Button>
        ))}
      </div>
      <Separator className="-mx-4 w-auto bg-border-subtle" />
      <Button
        variant="ghost"
        className="justify-start text-destructive hover:text-destructive"
        onClick={() => toast.success("Delete (demo)")}
      >
        Delete
      </Button>
    </div>
  )
}

/**
 * Attachments tab wired to the REAL S3 document store (#751): browser upload →
 * presign → S3 POST → confirm, presigned preview/download, soft-delete + Undo —
 * all via `/api/documents/*`. Seeded empty (no record↔attachment link exists
 * yet — #751); uploads land as documents in the active workspace. Its own hook
 * instance per mount, so the list is per-open.
 */
function InspectorAttachmentsTab() {
  const wiring = useInspectorAttachments({
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Attachment action failed",
      ),
  })
  return (
    <InspectorStack
      sections={[
        sectionInspectorAttachments({
          files: wiring.files,
          onUpload: (files) => void wiring.onUpload(files),
          onResolvePreview: wiring.onResolvePreview,
          onDownload: wiring.onDownload,
          onCopyUrl: wiring.onCopyUrl,
          onRemove: wiring.onRemove,
          onRestore: wiring.onRestore,
        }),
      ]}
    />
  )
}

/**
 * Compose every reusable Inspector section into the rail tabs, driven by the
 * clicked row — the living demo. One Inspector, structured only by tab: Details
 * (all actual info), Activity (audit log with per-change Undo), Related items
 * (posting + linked records + open items), Attachments (files/links + preview).
 * Sections are divided by full-width hairlines; key-detail values click-to-edit
 * inline and fold open under the header Edit toggle. English throughout; UI-only
 * handlers toast; reads `row`.
 */
function buildInspectorTabs(
  row: TableSectionRow,
): Partial<Record<InspectorTab, React.ReactNode>> {
  const status = String(row.status ?? "")
  const partner = String(row.partner ?? "")
  const doc = String(row.document ?? "document")
  const amount = Number(row.amount ?? 0)
  const vat = Number(row.vat ?? 0)
  const subtotal = amount - vat

  const invoiceItems: DetailsTableRow[] = [
    {
      id: "1",
      cells: {
        desc: "Consulting",
        qty: "8",
        unit: num(1200),
        base: num(9600),
        vat: num(2016),
      },
    },
    {
      id: "2",
      cells: {
        desc: "License",
        qty: "1",
        unit: num(648),
        base: num(648),
        vat: num(136),
      },
    },
  ]

  const posting: DetailsTableRow[] = [
    {
      id: "1",
      cells: {
        account: "518",
        name: "Services",
        debit: num(subtotal),
        credit: "",
      },
    },
    {
      id: "2",
      cells: { account: "343", name: "VAT", debit: num(vat), credit: "" },
    },
    {
      id: "3",
      cells: {
        account: "321",
        name: "Suppliers",
        debit: "",
        credit: num(amount),
      },
    },
  ]

  const openItems: DetailsTableRow[] = [
    {
      id: "1",
      cells: {
        doc,
        vs: "20260318",
        amount: num(amount),
        remaining: num(amount),
      },
    },
  ]

  return {
    details: (
      <InspectorStack
        sections={[
          sectionInspectorKeyDetails({
            lines: [
              { label: "Number", value: doc, icon: "HashIcon" },
              {
                label: "Type",
                value: row.kind,
                type: "select",
                options: KIND_OPTIONS,
                icon: "FileText",
              },
              {
                label: "Status",
                value: status,
                type: "select",
                options: STATUS_OPTIONS,
                icon: "CheckCircle2",
              },
              { label: "Partner", value: partner, icon: "Building2" },
              {
                label: "Company ID",
                value: "27082440",
                icon: "IdCard",
                action: {
                  label: "Look up in ARES",
                  icon: "Building2",
                  onClick: (ico) =>
                    toast.success(`Looked up ${ico} in ARES (demo)`),
                },
              },
              {
                label: "Issue date",
                value: row.date,
                type: "date",
                icon: "CalendarIcon",
              },
              {
                label: "Tax point date",
                value: row.date,
                type: "date",
                icon: "CalendarIcon",
              },
              {
                label: "Due date",
                value: "2026-04-14",
                type: "date",
                icon: "CalendarClock",
              },
              {
                label: "Total",
                value: amount,
                type: "money",
                icon: "Banknote",
                readOnly: true,
              },
              {
                label: "Payment",
                value: "transfer",
                type: "select",
                options: PAYMENT_OPTIONS,
                icon: "CreditCard",
              },
              {
                label: "Tags",
                value: "priority,review",
                type: "tags",
                icon: "HashIcon",
              },
            ],
          }),
          sectionInspectorMoneyTotals({
            title: "Totals",
            rows: [
              { label: "Base", amount: subtotal },
              { label: "VAT 21%", amount: vat },
              { label: "Rounding", amount: 0 },
              { label: "Total", amount, emphasis: true },
            ],
          }),
          sectionInspectorParagraph({
            title: "Reasoning",
            editValue: `Invoice from ${partner} for services, March 2026.`,
            onChange: (text) =>
              toast.success(`Summary saved: ${text.length} chars`),
            children: (
              <p>
                Invoice from <strong>{partner}</strong> for services rendered in
                March 2026. Amounts reconcile with <a href="#">PO-2026-118</a>;
                VAT applied at the standard 21% rate. No anomalies detected
                against prior documents from this partner.
              </p>
            ),
          }),
        ]}
      />
    ),
    items: (
      <InspectorStack
        sections={[
          sectionInspectorTable({
            title: "Invoice items",
            mode: "readonly",
            columns: INVOICE_ITEM_COLUMNS,
            rows: invoiceItems,
          }),
        ]}
      />
    ),
    activity: (
      <InspectorStack
        sections={[
          sectionInspectorActivityLog({
            title: "Activity",
            entries: [
              {
                id: "a1",
                field: "Total",
                before: "12 000 Kč",
                after: "12 400 Kč",
                when: "10:16",
                by: "Jana N.",
                onUndo: () => toast.success("Reverted Total (demo)"),
              },
              {
                id: "a2",
                field: "Status",
                before: "Draft",
                after: status,
                when: "10:15",
                by: "You",
                onUndo: () => toast.success("Reverted Status (demo)"),
              },
              {
                id: "a3",
                field: "Attachment",
                before: "—",
                after: "+ scan-front.jpg",
                when: "09:42",
                by: "You",
                onUndo: () => toast.success("Removed attachment (demo)"),
              },
              {
                id: "a4",
                field: "Attachment",
                before: "old-scan.jpg",
                after: "Deleted",
                when: "09:40",
                by: "You",
                onUndo: () => toast.success("Restored attachment (demo)"),
              },
            ],
          }),
        ]}
      />
    ),
    related: (
      <InspectorStack
        sections={[
          sectionInspectorTable({
            title: "Posting (debit / credit)",
            mode: "editable",
            addLabel: "Add line",
            columns: POSTING_COLUMNS,
            rows: posting,
          }),
          sectionInspectorLinkedRecords({
            title: "Relations",
            addLabel: "Link a document",
            onAdd: () => toast.success("Link a record (demo)"),
            onRemove: (id) => toast.success(`Unlinked ${id} (demo)`),
            items: [
              {
                id: "advance",
                relation: "Advance",
                label: "ADV-2026-004",
                meta: "§37a advance tax document",
                amount: 5000,
                icon: "ReceiptEuro",
                href: "#",
              },
              {
                id: "payment",
                relation: "Payment",
                relationVariant: "secondary",
                label: "Bank 2026-03-18",
                meta: "Matched · VS 20260318",
                amount,
                icon: "Banknote",
                href: "#",
              },
              {
                id: "order",
                relation: "Document",
                label: "PO-2026-118",
                meta: "Purchase order",
                icon: "FileText",
                href: "#",
              },
              {
                id: "contract",
                relation: "Reference",
                relationVariant: "outline",
                label: "Contract C-0042",
                meta: "Framework agreement",
                icon: "FileText",
              },
            ],
          }),
          sectionInspectorTable({
            title: "Open items (A/P ledger)",
            mode: "editable",
            addLabel: "Add item",
            columns: OPEN_ITEM_COLUMNS,
            rows: openItems,
          }),
        ]}
      />
    ),
    attachments: <InspectorAttachmentsTab />,
    export: (
      <InspectorStack
        sections={[
          sectionInspectorExport({
            fields: [
              { id: "header", label: "Header & parties" },
              { id: "lines", label: "Invoice lines" },
              { id: "totals", label: "Totals & VAT recap" },
              {
                id: "posting",
                label: "Posting (debit / credit)",
                defaultChecked: false,
              },
              {
                id: "attachments",
                label: "Attachments",
                defaultChecked: false,
              },
            ],
            onPrint: () => toast.success("Print (demo)"),
            onExport: (format, ids) =>
              toast.success(`Export ${format}: ${ids.length} field(s) (demo)`),
            onSendEmail: (email, format) =>
              toast.success(`Sent ${format} to ${email} (demo)`),
          }),
        ]}
      />
    ),
    more: <MoreActions />,
  }
}

export function ArchetypeTableView({
  favorite,
}: {
  favorite: ContentHeaderFavoriteToggle
}) {
  const [activeTab, setActiveTab] = React.useState("all")
  const [search, setSearch] = React.useState("")
  const [statusOpen, setStatusOpen] = React.useState(false)
  const [filters, setFilters] = React.useState<FiltersState>([])
  // Deep-link: `…?inspect=<row id>` re-opens the row's Inspector on load. Read
  // once from the URL — the "Copy link" action writes it (see onInspectorCopy).
  const [openRowId] = React.useState<string | undefined>(() =>
    typeof window === "undefined"
      ? undefined
      : (new URLSearchParams(window.location.search).get("inspect") ??
        undefined),
  )

  const {
    columns: filterColumns,
    actions: filterActions,
    strategy: filterStrategy,
  } = useFilterBar({
    strategy: "client" as const,
    data: DEMO_ROWS,
    columnsConfig: FILTER_COLUMNS,
    filters,
    onFiltersChange: setFilters,
  })

  // View tab + multi-filter chips both narrow the dataset (external filter →
  // fresh section rows). Status + search stay internal to the grid.
  const rows = React.useMemo(() => {
    const tab = INVOICE_TABS.find((t) => t.value === activeTab)
    const base = !tab?.kind
      ? DEMO_ROWS
      : DEMO_ROWS.filter((row) => row.kind === tab.kind)
    return filters.length
      ? base.filter((row) => matchesFilters(row, filters))
      : base
  }, [activeTab, filters])

  const buildToolbar = React.useCallback(
    (
      table: Table<TableSectionRow> | null,
    ): ContentToolbarProps<TableSectionRow> => {
      const statusColumn = table?.getColumn("status")
      const statusValue = (statusColumn?.getFilterValue() as string[]) ?? []
      return {
        statusFilter: {
          title: "Status",
          options: STATUS_OPTIONS,
          value: statusValue,
          onChange: (value) =>
            statusColumn?.setFilterValue(value.length ? value : undefined),
          multiple: true,
          open: statusOpen,
          onOpenChange: setStatusOpen,
        },
        search: {
          value: search,
          onChange: (value) => {
            setSearch(value)
            table?.setGlobalFilter(value)
          },
        },
        filter: {
          columns: filterColumns,
          filters,
          actions: filterActions,
          strategy: filterStrategy,
        },
        viewTools: table ? { table } : undefined,
        add: {
          label: "Add invoice",
          onAdd: () => toast.success("Add (demo)"),
          variants: ADD_TYPES.map((type) => ({ id: type, label: type })),
          onSelectVariant: (id) => toast.success(`Add ${id} (demo)`),
        },
      }
    },
    [search, statusOpen, filters, filterColumns, filterActions, filterStrategy],
  )

  return (
    <ArchetypeTable<TableSectionRow>
      title="Archetype Table"
      breadcrumb={[{ label: "Debug", href: "..", icon: "Bug" }]}
      favorite={favorite}
      views={{
        tabs: VIEW_TABS,
        value: activeTab,
        onValueChange: setActiveTab,
        onAddView: () => toast.success("Add view — dropdown coming soon"),
      }}
      toolbar={buildToolbar}
      inspectorRowTitle={(row) => `#${String(row.document ?? "")}`}
      inspectorRowName={(row) => String(row.partner ?? "")}
      inspectorRowBadge={(row) => {
        // Posting-status badge next to the name — ONLY the two non-posted
        // states carry a badge: Draft (secondary) and Rejected (destructive).
        // Posted (and anything else) shows none. Demo derivation off the
        // document number so both variants appear.
        const doc = String(row.document ?? "")
        const seed = doc.charCodeAt(doc.length - 1) % 3
        if (seed === 0) return { label: "Draft", variant: "secondary" }
        if (seed === 1) return { label: "Rejected", variant: "destructive" }
        return undefined
      }}
      inspectorRowContent={buildInspectorTabs}
      inspectorDeclineLabel="Reject"
      inspectorApproveLabel="Approve"
      onInspectorDecline={(row) =>
        toast.success(`Rejected #${String(row.document ?? "")} (demo)`)
      }
      onInspectorApprove={(row) =>
        toast.success(`Approved #${String(row.document ?? "")} (demo)`)
      }
      openRowId={openRowId}
      onInspectorCopy={(row, what) => {
        const doc = String(row.document ?? "")
        // "Copy link" → this page + the row uuid + inspector-open flag, so
        // pasting it back re-opens exactly this record (no permissions page,
        // no extra state). "Number" → the human number; "ID" → the raw uuid.
        const value =
          what === "link"
            ? `${window.location.origin}${window.location.pathname}?inspect=${String(row.id ?? "")}`
            : what === "id"
              ? String(row.id ?? "")
              : `#${doc}`
        void navigator.clipboard.writeText(value)
        toast.success(
          what === "link"
            ? "Link copied"
            : what === "id"
              ? "ID copied"
              : "Number copied",
        )
      }}
      onInspectorSwitchLayout={() => toast.success("Switch layout (demo)")}
      sections={[
        sectionTable({
          anchor: "invoices",
          rowIdKey: "id",
          columns: COLUMNS,
          rows,
          features: {
            search: true,
            inspect: true,
            rowActions: true,
          },
          emptyText: "No invoices match.",
        }),
      ]}
      selectionActions={(table) => [
        {
          id: "match",
          label: "Match",
          icon: "LinkIcon",
          onSelect: () =>
            toast.success(
              `Match ${table?.getFilteredSelectedRowModel().rows.length ?? 0} (demo)`,
            ),
        },
        {
          id: "edit",
          label: "Edit",
          icon: "Pencil",
          onSelect: () => toast.success("Edit (demo)"),
        },
        {
          id: "delete",
          label: "Delete",
          icon: "Trash2",
          variant: "destructive",
          onSelect: () => toast.success("Delete (demo)"),
        },
      ]}
    />
  )
}
