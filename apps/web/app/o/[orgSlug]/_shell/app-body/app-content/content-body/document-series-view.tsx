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
  sectionTable,
} from "@workspace/ui/blocks/content-panel"
import type {
  ContentFooterAction,
  ContentHeaderFavoriteToggle,
  ContentToolbarProps,
  TableColumnSpec,
  TableSectionRow,
  ViewTab,
} from "@workspace/ui/blocks/content-panel"
import type { InspectorKeyLine } from "@workspace/ui/blocks/inspector-sheet"
import type { InspectorTab } from "@workspace/ui/blocks/inspector-sheet"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { toast } from "@workspace/ui/components/sonner"
import { Check, Pencil, Plus, Trash2 } from "@workspace/ui/lib/icons"

import { orgHref } from "@/lib/org/href"
import {
  deletePeriodRow,
  savePeriodRow,
  saveSeries,
} from "@/lib/org/document-series-actions"
import type {
  ConfigurablePeriod,
  DocumentSeriesView as SeriesModel,
} from "@/lib/org/document-series"
import type { DocumentCategory } from "@workspace/accounting"

/**
 * DocumentSeriesView — Dokladové řady. A flat Table archetype whose view tabs are
 * the 4 initial config categories (RECEIVED_INVOICE, ISSUED_INVOICE, INTERNAL,
 * TAX_APPLICATION); switching a tab filters to that category's séries. Clicking a
 * row opens the Inspector edit form (Identity / Platnost), which holds a per-row
 * draft and persists it through `saveSeries` on Save. Below the key-details the
 * Inspector renders the bespoke `NumberingGrid` — the per-účetní-období numbering
 * rows (Délka čísla / Prefix / Postfix), each row and the add-row control wired to
 * its own persisting action. Akt.číslo (the gapless counter) is display-only and is
 * never editable here.
 */

/** Default number length for a freshly-added period row. */
const DEFAULT_NUMBER_LENGTH = 4

/** The editable slice of a série held as an Inspector draft. */
interface Draft {
  name?: string
  note?: string
  description?: string
  validFromYear?: number | null
  validToYear?: number | null
}

/** Parse a year input to an integer, or null for empty/non-numeric (never NaN). */
function parseYear(next: string): number | null {
  const n = Number.parseInt(next, 10)
  return next.trim() === "" || Number.isNaN(n) ? null : n
}

export function DocumentSeriesView({
  slug,
  title,
  series,
  periods,
  categories,
  favorite,
}: {
  slug: string
  title: string
  series: readonly SeriesModel[]
  periods: readonly ConfigurablePeriod[]
  categories: readonly DocumentCategory[]
  favorite: ContentHeaderFavoriteToggle
}) {
  const tn = useTranslations("org.nav")
  const tcat = useTranslations("org.docCategory")
  const tc = useTranslations("accounting.documentSeries.columns")
  const tp = useTranslations("accounting.documentSeries.page")
  const ti = useTranslations("accounting.documentSeries.inspector")

  const [activeTab, setActiveTab] = React.useState<string>(
    categories[0] ?? "RECEIVED_INVOICE",
  )
  const [search, setSearch] = React.useState("")
  const [drafts, setDrafts] = React.useState<Record<string, Draft>>({})

  const activeCategory = activeTab as DocumentCategory
  const byId = React.useMemo(
    () => new Map(series.map((s) => [s.id, s])),
    [series],
  )

  const columns = React.useMemo<TableColumnSpec[]>(
    () => [
      { id: "code", header: tc("code"), kind: "text", role: "id", width: 180 },
      { id: "name", header: tc("name"), kind: "text", width: 360 },
    ],
    [tc],
  )

  const rows = React.useMemo<TableSectionRow[]>(
    () =>
      series
        .filter((s) => s.category === activeCategory)
        .map((s) => ({ id: s.id, code: s.code, name: s.name ?? "" })),
    [series, activeCategory],
  )

  const views: ViewTab[] = React.useMemo(
    () =>
      categories.map((cat) => ({
        value: cat,
        label: tcat(cat),
        count: series.filter((s) => s.category === cat).length,
      })),
    [categories, series, tcat],
  )

  const buildToolbar = React.useCallback(
    (
      table: Table<TableSectionRow> | null,
    ): ContentToolbarProps<TableSectionRow> =>
      buildTableToolbar(table, {
        search: { value: search, onChange: setSearch },
      }),
    [search],
  )

  const selectionActions = React.useCallback(
    (
      table: Table<TableSectionRow> | null,
      _helpers: ArchetypeTableSelectionHelpers,
    ): ContentFooterAction[] =>
      buildTableFooter(table, { exportFileName: tp("exportFileName") }),
    [tp],
  )

  const patch = React.useCallback((id: string, next: Partial<Draft>) => {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...next } }))
  }, [])

  const inspectorContent = React.useCallback(
    (row: TableSectionRow): Partial<Record<InspectorTab, React.ReactNode>> => {
      const s = byId.get(String(row.id))
      if (!s) return {}
      const id = s.id
      const d = drafts[id] ?? {}
      // Key on PRESENCE, not nullishness: a draft that intentionally clears a
      // field to null must win over the stale server value (else the clear is
      // silently dropped and Save falsely reports success).
      const val = <K extends keyof Draft>(key: K): Draft[K] =>
        key in d ? d[key] : (s[key as keyof SeriesModel] as Draft[K])

      const identity: InspectorKeyLine[] = [
        { label: ti("code"), value: s.code, icon: "HashIcon", readOnly: true },
        {
          label: ti("name"),
          value: val("name") ?? "",
          onChange: (next) => patch(id, { name: next }),
        },
        {
          label: ti("note"),
          value: val("note") ?? "",
          onChange: (next) => patch(id, { note: next }),
        },
        {
          label: ti("description"),
          value: val("description") ?? "",
          onChange: (next) => patch(id, { description: next }),
        },
      ]

      const validity: InspectorKeyLine[] = [
        {
          label: ti("validFrom"),
          value: val("validFromYear") ?? "",
          type: "number",
          onChange: (next) => patch(id, { validFromYear: parseYear(next) }),
        },
        {
          label: ti("validTo"),
          value: val("validToYear") ?? "",
          type: "number",
          onChange: (next) => patch(id, { validToYear: parseYear(next) }),
        },
      ]

      return {
        details: (
          <>
            <SectionList
              sections={[
                sectionInspectorKeyDetails({
                  title: ti("sectionIdentity"),
                  lines: identity,
                }),
                sectionInspectorKeyDetails({
                  title: ti("sectionValidity"),
                  lines: validity,
                }),
              ]}
            />
            <NumberingGrid key={id} slug={slug} series={s} periods={periods} />
          </>
        ),
      }
    },
    [byId, drafts, periods, ti, slug, patch],
  )

  const onApprove = React.useCallback(
    (row: TableSectionRow) => {
      const s = byId.get(String(row.id))
      if (!s) return
      const d = drafts[s.id] ?? {}
      void saveSeries({
        slug,
        category: s.category ?? activeCategory,
        code: s.code,
        name: "name" in d ? d.name : s.name,
        note: "note" in d ? d.note : s.note,
        description: "description" in d ? d.description : s.description,
        validFromYear: "validFromYear" in d ? d.validFromYear : s.validFromYear,
        validToYear: "validToYear" in d ? d.validToYear : s.validToYear,
      }).then((r) => {
        if (r.ok) {
          setDrafts((prev) => {
            const { [s.id]: _drop, ...rest } = prev
            return rest
          })
          toast.success(ti("saved"))
        } else {
          toast.error(ti("saveError"))
        }
      })
    },
    [byId, drafts, slug, activeCategory, ti],
  )

  return (
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
      inspectorRowTitle={(row) => String(row.code ?? "")}
      inspectorRowName={(row) => String(row.name ?? "")}
      inspectorRowContent={inspectorContent}
      inspectorApproveLabel={ti("save")}
      onInspectorApprove={onApprove}
      sections={[
        sectionTable({
          anchor: "document-series",
          columns,
          rows,
          rowIdKey: "id",
          features: { search: true, inspect: true },
          emptyText: tp("empty"),
        }),
      ]}
    />
  )
}

/** Per-row editable draft of a numbering row's format (never the counter). */
interface RowDraft {
  numberLength?: number
  prefix?: string
  postfix?: string
}

/**
 * NumberingGrid — the per-účetní-období numbering rows of one série. Each row edits
 * only the format (Délka čísla / Prefix / Postfix) and shows Akt.číslo read-only; the
 * per-row Save persists through `savePeriodRow`, Delete through `deletePeriodRow`
 * (guarded server-side, a row that has issued numbers surfaces a soft toast). The
 * add-row control offers only periods not yet configured for this série. Every
 * action revalidates the page, so the grid re-renders from fresh server data.
 */
function NumberingGrid({
  slug,
  series,
  periods,
}: {
  slug: string
  series: SeriesModel
  periods: readonly ConfigurablePeriod[]
}) {
  const tg = useTranslations("accounting.documentSeries.grid")
  const ti = useTranslations("accounting.documentSeries.inspector")

  const periodLabel = React.useMemo(
    () => new Map(periods.map((p) => [p.id, p.label])),
    [periods],
  )
  const availablePeriods = React.useMemo(() => {
    const configured = new Set(series.periods.map((p) => p.periodId))
    return periods.filter((p) => !configured.has(p.id))
  }, [periods, series.periods])

  const [rowDrafts, setRowDrafts] = React.useState<Record<string, RowDraft>>({})
  const [addPeriodId, setAddPeriodId] = React.useState<string>("")

  const patchRow = (id: string, next: Partial<RowDraft>) =>
    setRowDrafts((d) => ({ ...d, [id]: { ...d[id], ...next } }))

  const clearRow = (id: string) =>
    setRowDrafts((prev) => {
      const { [id]: _drop, ...rest } = prev
      return rest
    })

  const saveRow = (rowId: string, periodId: string, draft: RowDraft) => {
    const current = series.periods.find((p) => p.id === rowId)
    void savePeriodRow({
      slug,
      numberSeriesId: series.id,
      periodId,
      numberLength:
        draft.numberLength ?? current?.numberLength ?? DEFAULT_NUMBER_LENGTH,
      prefix: draft.prefix ?? current?.prefix ?? "",
      postfix: draft.postfix ?? current?.postfix ?? "",
    }).then((r) => {
      if (r.ok) {
        clearRow(rowId)
        toast.success(tg("saved"))
      } else {
        toast.error(ti("saveError"))
      }
    })
  }

  const deleteRow = (id: string) => {
    void deletePeriodRow({ slug, id }).then((r) => {
      if (!r.ok) toast.error(tg("deleteInUse"))
    })
  }

  const addRow = () => {
    if (!addPeriodId) return
    void savePeriodRow({
      slug,
      numberSeriesId: series.id,
      periodId: addPeriodId,
      numberLength: DEFAULT_NUMBER_LENGTH,
      prefix: "",
      postfix: "",
    }).then((r) => {
      if (r.ok) {
        setAddPeriodId("")
        toast.success(tg("saved"))
      } else {
        toast.error(ti("saveError"))
      }
    })
  }

  return (
    <section className="flex flex-col gap-2 border-t border-border-subtle px-4 py-4">
      <h3 className="text-sm font-medium text-foreground">{tg("title")}</h3>

      <div className="grid grid-cols-[1fr_5rem_1fr_1fr_5rem_auto] items-center gap-2 text-xs font-medium text-muted-foreground">
        <span>{tg("period")}</span>
        <span>{tg("length")}</span>
        <span>{tg("prefix")}</span>
        <span>{tg("postfix")}</span>
        <span className="text-right">{tg("current")}</span>
        <span />
      </div>

      {series.periods.map((row) => {
        const d = rowDrafts[row.id] ?? {}
        const length = d.numberLength ?? row.numberLength
        const prefix = d.prefix ?? row.prefix
        const postfix = d.postfix ?? row.postfix
        const dirty =
          d.numberLength !== undefined ||
          d.prefix !== undefined ||
          d.postfix !== undefined
        return (
          <div
            key={row.id}
            className="grid grid-cols-[1fr_5rem_1fr_1fr_5rem_auto] items-center gap-2"
          >
            <span className="truncate text-sm text-foreground">
              {periodLabel.get(row.periodId) ?? row.periodId}
            </span>
            <Input
              type="number"
              min={1}
              value={length}
              onChange={(e) => {
                const n = Number.parseInt(e.target.value, 10)
                patchRow(row.id, { numberLength: Number.isNaN(n) ? 1 : n })
              }}
            />
            <Input
              value={prefix}
              onChange={(e) => patchRow(row.id, { prefix: e.target.value })}
            />
            <Input
              value={postfix}
              onChange={(e) => patchRow(row.id, { postfix: e.target.value })}
            />
            <span className="text-right text-sm text-muted-foreground tabular-nums">
              {row.currentNumber}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={tg("save")}
                onClick={() => saveRow(row.id, row.periodId, d)}
              >
                {dirty ? <Check /> : <Pencil />}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={tg("delete")}
                onClick={() => deleteRow(row.id)}
              >
                <Trash2 />
              </Button>
            </div>
          </div>
        )
      })}

      {availablePeriods.length > 0 && (
        <div className="flex items-center gap-2 pt-1">
          <Select value={addPeriodId} onValueChange={setAddPeriodId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder={tg("addPeriod")} />
            </SelectTrigger>
            <SelectContent>
              {availablePeriods.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            disabled={!addPeriodId}
            onClick={addRow}
          >
            <Plus />
            {tg("add")}
          </Button>
        </div>
      )}
    </section>
  )
}
