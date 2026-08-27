"use client"

import * as React from "react"
import type { Table } from "@tanstack/react-table"

import { useTranslations } from "@workspace/i18n/client"
import { ArchetypeTable } from "@workspace/ui/blocks/archetypes"
import type { ArchetypeTableSelectionHelpers } from "@workspace/ui/blocks/archetypes"
import {
  buildTableFooter,
  buildTableToolbar,
  SectionList,
  sectionInspectorKeyDetails,
  sectionTreeTable,
  useTreeTableFilters,
} from "@workspace/ui/blocks/content-panel"
import type { InspectorTab } from "@workspace/ui/blocks/inspector-sheet"
import type { FiltersState } from "@workspace/ui/components/filter-bar"
import type {
  ActionDescriptor,
  ContentFooterAction,
  ContentHeaderFavoriteToggle,
  ContentToolbarProps,
  TableColumnSpec,
  TableSectionRow,
  TreeTableRow,
  ViewTab,
} from "@workspace/ui/blocks/content-panel"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { toast } from "@workspace/ui/components/sonner"

import { orgHref } from "@/lib/org/href"
import {
  ACCOUNT_NATURES,
  EMPTY_ADD_ACCOUNT_FORM,
  isAddFormValid,
  toAddAccountInput,
  validateAddForm,
  type AddAccountForm,
  type AddAccountInput,
} from "@/lib/org/chart-of-accounts-add"

/**
 * ChartOfAccountsView — the Účtový rozvrh (chart of accounts) page body.
 *
 * A Tree-table archetype over the period's real chart: Class → Group → Synthetic →
 * Analytical. Structural Class/Group tiers are label-only; every real synthetic +
 * analytical account is a fully-wired row (select, sort, per-column filter, CSV
 * export). Classification + boolean columns render as PLAIN TEXT (a read-only
 * `select` cell, not a chip). The tree is projected server-side (`buildChartTree`)
 * and passed in; enum/boolean cells arrive as RAW codes and are localized here
 * through each column's `options`, so faceting stays keyed on stable values.
 *
 * Writes (all human-gated, wired here):
 *  - EDIT — the row Inspector's name / open-items / tax-relevant fields are
 *    editable; each field persists once through `onUpdateAccount` at its commit
 *    boundary (input blur / Enter, or a select pick), and the server action
 *    revalidates the page. číslo / type / nature stay read-only (derived).
 *  - SEED — an empty chart offers two toolbar actions: fill from the year framework
 *    (`onSeedFromFramework`) or fork a prebuilt template (`onSeedFromTemplate`, via
 *    the picker dialog). Both revalidate server-side.
 */

/** Enum value sets → localized `select` options (value = stable code, label = i18n). */
const STATEMENT_CLASSES = [
  "BALANCE_SHEET",
  "INCOME_STATEMENT",
  "CLOSING",
  "OFF_BALANCE",
] as const
const ACCOUNT_TYPES = ["ACTIVE", "PASSIVE", "EXPENSE", "REVENUE"] as const
const NORMAL_BALANCES = ["DEBIT", "CREDIT"] as const
const BOOLEANS = ["yes", "no"] as const

/** The user-editable fields of an account (mirrors the domain `updateAccount`). */
type EditableField = "name" | "tracksOpenItems" | "taxRelevant"

/** Patch the inspector sends back through the server action. */
export interface UpdateAccountInput {
  id: string
  name?: string
  tracksOpenItems?: boolean
  taxRelevant?: boolean | null
}

/** A prebuilt chart template as the picker lists it. */
export interface ChartTemplateOption {
  id: string
  label: string
  isDefault: boolean
}

/** A synthetic account the add-form offers as a parent for a new analytical. */
export interface SyntheticOption {
  id: string
  number: string
  name: string
}

export function ChartOfAccountsView({
  slug,
  title,
  favorite,
  tree,
  emptyText,
  canSeed,
  canAdd,
  templates,
  synthetics,
  onSeedFromFramework,
  onSeedFromTemplate,
  onUpdateAccount,
  onAddAccount,
}: {
  slug: string
  title: string
  favorite: ContentHeaderFavoriteToggle
  tree: readonly TreeTableRow[]
  emptyText: string
  /** True when the active period has an empty chart — the seed actions show. */
  canSeed: boolean
  /** True when a chart exists — the "add account" toolbar action shows. */
  canAdd: boolean
  templates: readonly ChartTemplateOption[]
  /** Synthetic accounts, offered as the optional parent of a new analytical. */
  synthetics: readonly SyntheticOption[]
  onSeedFromFramework: () => Promise<void>
  onSeedFromTemplate: (templateId: string) => Promise<void>
  onUpdateAccount: (input: UpdateAccountInput) => Promise<void>
  onAddAccount: (input: AddAccountInput) => Promise<void>
}) {
  const tn = useTranslations("org.nav")
  const tc = useTranslations("accounting.chartOfAccounts.columns")
  const tsc = useTranslations("accounting.chartOfAccounts.statementClass")
  const tat = useTranslations("accounting.chartOfAccounts.accountType")
  const tnb = useTranslations("accounting.chartOfAccounts.normalBalance")
  const tb = useTranslations("accounting.chartOfAccounts.boolean")
  const tp = useTranslations("accounting.chartOfAccounts.page")

  const columns = React.useMemo<TableColumnSpec[]>(
    () => [
      {
        id: "number",
        header: tc("number"),
        kind: "text",
        role: "id",
        width: 280,
      },
      { id: "name", header: tc("name"), kind: "text", width: 320 },
      {
        id: "statementClass",
        header: tc("statementClass"),
        kind: "select",
        options: STATEMENT_CLASSES.map((v) => ({ value: v, label: tsc(v) })),
        width: 160,
      },
      {
        id: "accountType",
        header: tc("accountType"),
        kind: "select",
        options: ACCOUNT_TYPES.map((v) => ({ value: v, label: tat(v) })),
        width: 130,
      },
      {
        id: "normalBalance",
        header: tc("normalBalance"),
        kind: "select",
        options: NORMAL_BALANCES.map((v) => ({ value: v, label: tnb(v) })),
        width: 130,
      },
      {
        id: "tracksOpenItems",
        header: tc("tracksOpenItems"),
        kind: "select",
        options: BOOLEANS.map((v) => ({ value: v, label: tb(v) })),
        align: "end",
        width: 130,
      },
      {
        id: "taxRelevant",
        header: tc("taxRelevant"),
        kind: "select",
        options: BOOLEANS.map((v) => ({ value: v, label: tb(v) })),
        align: "end",
        width: 120,
      },
    ],
    [tc, tsc, tat, tnb, tb],
  )

  const [activeTab, setActiveTab] = React.useState("all")
  const [search, setSearch] = React.useState("")
  const [filters, setFilters] = React.useState<FiltersState>([])

  // Column-driven toolbar filter + the recursively-narrowed tree it produces
  // (keeps ancestor tiers of a matching account).
  const { filter, rows: filteredTree } = useTreeTableFilters({
    columns,
    rows: tree,
    filters,
    onFiltersChange: setFilters,
  })

  const views: ViewTab[] = [{ value: "all", label: tp("view") }]

  // ── Edit: persist once at the field's commit boundary (blur / Enter / pick) ──
  // The inspector line fires `onCommit` only when a field actually settles with a
  // changed value, so there is no per-keystroke save and no re-render tearing down
  // the open editor. The server action revalidates the page (no client refresh).
  const [, startEdit] = React.useTransition()
  const commitField = React.useCallback(
    (id: string, field: EditableField, raw: string) => {
      if (!id) return
      const input: UpdateAccountInput =
        field === "name"
          ? { id, name: raw }
          : field === "tracksOpenItems"
            ? { id, tracksOpenItems: raw === "yes" }
            : { id, taxRelevant: raw === "none" ? null : raw === "yes" }
      startEdit(async () => {
        try {
          await onUpdateAccount(input)
        } catch {
          toast.error(tp("updateFailed"))
        }
      })
    },
    [onUpdateAccount, tp],
  )

  // ── Seed: fill an empty chart from the framework or a template ──
  const [seedPending, startSeed] = React.useTransition()
  const [pickerOpen, setPickerOpen] = React.useState(false)

  const runFramework = React.useCallback(() => {
    startSeed(async () => {
      try {
        await onSeedFromFramework()
        toast.success(tp("seedSuccess"))
      } catch {
        toast.error(tp("seedFailed"))
      }
    })
  }, [onSeedFromFramework, tp])

  const runTemplate = React.useCallback(
    (templateId: string) => {
      setPickerOpen(false)
      startSeed(async () => {
        try {
          await onSeedFromTemplate(templateId)
          toast.success(tp("seedSuccess"))
        } catch {
          toast.error(tp("seedFailed"))
        }
      })
    },
    [onSeedFromTemplate, tp],
  )

  const seedActions = React.useMemo<ActionDescriptor[]>(
    () =>
      canSeed
        ? [
            {
              id: "seed-framework",
              label: tp("seedFromFramework"),
              variant: "default",
              disabled: seedPending,
              onSelect: runFramework,
            },
            {
              id: "seed-template",
              label: tp("seedFromTemplate"),
              variant: "outline",
              disabled: seedPending || templates.length === 0,
              onSelect: () => setPickerOpen(true),
            },
          ]
        : [],
    [canSeed, seedPending, templates.length, runFramework, tp],
  )

  // ── Add: a page-owned inspector panel (a new account has no row, so it can't
  // use the row-rail). The toolbar "Add account" opens it; the form persists once
  // through `onAddAccount` and the server action revalidates the tree. ──
  const [addOpen, setAddOpen] = React.useState(false)
  const [addPending, startAdd] = React.useTransition()

  const submitAdd = React.useCallback(
    (input: AddAccountInput) => {
      startAdd(async () => {
        try {
          await onAddAccount(input)
          toast.success(tp("addSuccess"))
          setAddOpen(false)
        } catch {
          toast.error(tp("addFailed"))
        }
      })
    },
    [onAddAccount, tp],
  )

  const buildToolbar = React.useCallback(
    (
      table: Table<TableSectionRow> | null,
    ): ContentToolbarProps<TableSectionRow> =>
      buildTableToolbar(table, {
        search: {
          value: search,
          onChange: setSearch,
          placeholder: tp("searchPlaceholder"),
        },
        expandAll: {
          groupLabel: tp("collapseAll"),
          ungroupLabel: tp("expandAll"),
        },
        filter,
        actions: seedActions.length > 0 ? seedActions : undefined,
        add: canAdd
          ? { label: tp("addAccount"), onAdd: () => setAddOpen(true) }
          : undefined,
      }),
    [search, filter, tp, seedActions, canAdd],
  )

  const selectionActions = React.useCallback(
    (
      table: Table<TableSectionRow> | null,
      _helpers: ArchetypeTableSelectionHelpers,
    ): ContentFooterAction[] =>
      // Read-only footer: the only selection action is CSV export of the selected
      // accounts (tiers are not selectable, so a selection is always accounts).
      buildTableFooter(table, { exportFileName: tp("exportFileName") }),
    [tp],
  )

  // Row Inspector: číslo + derived dimensions read-only; name + the two policy
  // flags editable, persisting through `commitField` at each field's commit
  // boundary. Labels + enum values reuse the column i18n. Sections are minted
  // inside the client boundary.
  const inspectorContent = React.useCallback(
    (row: TableSectionRow): Partial<Record<InspectorTab, React.ReactNode>> => {
      const id = String(row.id ?? "")
      const asLabel = (
        v: string | number | null | undefined,
        t: (k: never) => string,
      ) => (v == null || v === "" ? "—" : t(String(v) as never))
      const flagValue = (v: string | number | null | undefined) =>
        v == null || v === "" ? "" : String(v)
      const boolOptions = BOOLEANS.map((v) => ({ value: v, label: tb(v) }))
      // Tax-relevance is boolean|null — a third "clear" option resets it to NULL
      // (a real value, not "No"), for balance / closing accounts that carry no tax
      // relevance. Radix forbids an empty option value, so the sentinel is "none".
      const taxOptions = [
        ...boolOptions,
        { value: "none", label: tp("taxClear") },
      ]
      return {
        details: (
          <SectionList
            sections={[
              sectionInspectorKeyDetails({
                lines: [
                  {
                    label: tc("number"),
                    value: String(row.number ?? ""),
                    icon: "HashIcon",
                    readOnly: true,
                  },
                  {
                    label: tc("name"),
                    value: String(row.name ?? ""),
                    onCommit: (v) => commitField(id, "name", v),
                  },
                  {
                    label: tc("statementClass"),
                    value: asLabel(row.statementClass, tsc),
                    readOnly: true,
                  },
                  {
                    label: tc("accountType"),
                    value: asLabel(row.accountType, tat),
                    readOnly: true,
                  },
                  {
                    label: tc("normalBalance"),
                    value: asLabel(row.normalBalance, tnb),
                    readOnly: true,
                  },
                  {
                    label: tc("tracksOpenItems"),
                    value: flagValue(row.tracksOpenItems),
                    type: "select",
                    options: boolOptions,
                    onCommit: (v) => commitField(id, "tracksOpenItems", v),
                  },
                  {
                    label: tc("taxRelevant"),
                    value: flagValue(row.taxRelevant),
                    type: "select",
                    options: taxOptions,
                    placeholder: "—",
                    onCommit: (v) => commitField(id, "taxRelevant", v),
                  },
                ],
              }),
            ]}
          />
        ),
      }
    },
    [tc, tsc, tat, tnb, tb, tp, commitField],
  )

  return (
    <>
      <ArchetypeTable<TableSectionRow>
        title={title}
        breadcrumb={[
          {
            label: tn("accounting"),
            href: orgHref(slug, "accounting"),
            icon: "BookOpen",
          },
        ]}
        favorite={favorite}
        views={{ tabs: views, value: activeTab, onValueChange: setActiveTab }}
        toolbar={buildToolbar}
        selectionActions={selectionActions}
        inspectorRowTitle={(row) => String(row.number ?? "")}
        inspectorRowName={(row) => String(row.name ?? "")}
        inspectorRowContent={inspectorContent}
        inspector={
          addOpen ? (
            <AddAccountForm
              synthetics={synthetics}
              pending={addPending}
              onSubmit={submitAdd}
              onCancel={() => setAddOpen(false)}
            />
          ) : null
        }
        inspectorOpen={addOpen}
        inspectorMode="panel"
        onInspectorOpenChange={setAddOpen}
        inspectorTitle={tp("addPanelTitle")}
        sections={[
          sectionTreeTable({
            anchor: "chart",
            columns,
            rows: filteredTree,
            defaultExpanded: 2,
            features: { search: true, inspect: true },
            emptyText,
          }),
        ]}
      />
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tp("templatePickerTitle")}</DialogTitle>
            <DialogDescription>
              {tp("templatePickerDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {templates.map((t) => (
              <Button
                key={t.id}
                variant="outline"
                className="justify-between"
                disabled={seedPending}
                onClick={() => runTemplate(t.id)}
              >
                <span className="truncate">{t.label}</span>
                {t.isDefault ? (
                  <span className="text-xs text-muted-foreground">
                    {tp("templateDefault")}
                  </span>
                ) : null}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * AddAccountForm — the page-owned inspector panel body for adding a new account.
 * It holds its own field state (remounted fresh on each open), validates at the
 * boundary (number shape, name, nature), and hands a clean `AddAccountInput` to
 * `onSubmit`. Shared field labels reuse the column i18n; nature + add-only chrome
 * come from the page namespace. Minted inside this client boundary.
 */
function AddAccountForm({
  synthetics,
  pending,
  onSubmit,
  onCancel,
}: {
  synthetics: readonly SyntheticOption[]
  pending: boolean
  onSubmit: (input: AddAccountInput) => void
  onCancel: () => void
}) {
  const tc = useTranslations("accounting.chartOfAccounts.columns")
  const tp = useTranslations("accounting.chartOfAccounts.page")
  const tb = useTranslations("accounting.chartOfAccounts.boolean")
  const tnb = useTranslations("accounting.chartOfAccounts.normalBalance")
  const tnat = useTranslations("accounting.chartOfAccounts.nature")

  const [form, setForm] = React.useState<AddAccountForm>(EMPTY_ADD_ACCOUNT_FORM)
  const [attempted, setAttempted] = React.useState(false)
  const set = (patch: Partial<AddAccountForm>) =>
    setForm((f) => ({ ...f, ...patch }))

  const errors = validateAddForm(form)

  // Picking a synthetic parent prefills the number with its prefix (e.g. "311.")
  // — but only while the user hasn't started typing a number themselves.
  const onParent = (value: string) => {
    if (value === "none") {
      set({ parentId: "" })
      return
    }
    const parent = synthetics.find((s) => s.id === value)
    setForm((f) => ({
      ...f,
      parentId: value,
      number: f.number === "" && parent ? `${parent.number}.` : f.number,
    }))
  }

  const submit = () => {
    setAttempted(true)
    if (!isAddFormValid(form)) return
    onSubmit(toAddAccountInput(form))
  }

  const err = (key: "number" | "name" | "nature", message: string) =>
    attempted && errors[key] ? (
      <p className="text-xs text-destructive">{message}</p>
    ) : null

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="add-parent">{tp("addParent")}</Label>
        <Select
          value={form.parentId === "" ? "none" : form.parentId}
          onValueChange={onParent}
        >
          <SelectTrigger id="add-parent">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{tp("addParentNone")}</SelectItem>
            {synthetics.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.number} — {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="add-number">{tc("number")}</Label>
        <Input
          id="add-number"
          value={form.number}
          placeholder="311"
          aria-invalid={attempted && Boolean(errors.number)}
          onChange={(e) => set({ number: e.target.value })}
        />
        {err("number", tp("addNumberInvalid"))}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="add-name">{tc("name")}</Label>
        <Input
          id="add-name"
          value={form.name}
          aria-invalid={attempted && Boolean(errors.name)}
          onChange={(e) => set({ name: e.target.value })}
        />
        {err("name", tp("addNameRequired"))}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="add-nature">{tp("addNature")}</Label>
        <Select
          value={form.nature === "" ? undefined : form.nature}
          onValueChange={(v) => set({ nature: v as AddAccountForm["nature"] })}
        >
          <SelectTrigger
            id="add-nature"
            aria-invalid={attempted && Boolean(errors.nature)}
          >
            <SelectValue placeholder={tp("addNaturePlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {ACCOUNT_NATURES.map((n) => (
              <SelectItem key={n} value={n}>
                {tnat(n)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {err("nature", tp("addNatureRequired"))}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="add-normal">{tc("normalBalance")}</Label>
        <Select
          value={form.normalBalance === "" ? "auto" : form.normalBalance}
          onValueChange={(v) =>
            set({
              normalBalance: v === "auto" ? "" : (v as "DEBIT" | "CREDIT"),
            })
          }
        >
          <SelectTrigger id="add-normal">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">{tp("addNormalBalanceAuto")}</SelectItem>
            <SelectItem value="DEBIT">{tnb("DEBIT")}</SelectItem>
            <SelectItem value="CREDIT">{tnb("CREDIT")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="add-open-items">{tc("tracksOpenItems")}</Label>
        <Select
          value={form.tracksOpenItems}
          onValueChange={(v) => set({ tracksOpenItems: v as "yes" | "no" })}
        >
          <SelectTrigger id="add-open-items">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="no">{tb("no")}</SelectItem>
            <SelectItem value="yes">{tb("yes")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="add-tax">{tc("taxRelevant")}</Label>
        <Select
          value={form.taxRelevant}
          onValueChange={(v) =>
            set({ taxRelevant: v as "yes" | "no" | "none" })
          }
        >
          <SelectTrigger id="add-tax">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{tp("taxClear")}</SelectItem>
            <SelectItem value="yes">{tb("yes")}</SelectItem>
            <SelectItem value="no">{tb("no")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" disabled={pending} onClick={onCancel}>
          {tp("addCancel")}
        </Button>
        <Button disabled={pending} onClick={submit}>
          {tp("addSubmit")}
        </Button>
      </div>
    </div>
  )
}
