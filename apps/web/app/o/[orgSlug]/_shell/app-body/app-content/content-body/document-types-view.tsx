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
  TableColumnOption,
  TableColumnSpec,
  TableSectionRow,
  ViewTab,
} from "@workspace/ui/blocks/content-panel"
import type { InspectorKeyLine } from "@workspace/ui/blocks/inspector-sheet"
import type { InspectorTab } from "@workspace/ui/blocks/inspector-sheet"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Field, FieldError, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { toast } from "@workspace/ui/components/sonner"

import { orgHref } from "@/lib/org/href"
import {
  saveDocumentType,
  setPrimaryType,
  setTypeActive,
} from "@/lib/org/document-type-actions"
import type {
  DocumentSeriesOption,
  DocumentTypeView,
} from "@/lib/org/document-types"
import type { DocumentCategory, DocumentKind } from "@workspace/accounting"

/**
 * DocumentTypesView — Typy dokladů. A flat Table archetype whose view tabs are the
 * 9 config categories (RECEIVED_INVOICE … TAX_APPLICATION); switching a tab filters
 * to that category's types. Clicking a row opens the Inspector edit form (Základní /
 * Účtování / DPH), which holds a per-row draft and persists the whole draft through
 * `saveDocumentType` on Save; Nastavit primární / Archivovat call the dedicated
 * atomic writers. All strings come from the catalog; empty categories render an
 * empty body (no placeholder rows).
 */

/** The editable slice of a type held as an Inspector draft. */
interface Draft {
  name?: string
  kind?: DocumentKind | null
  defaultSeriesId?: string | null
  dueDays?: number | null
  defaultAccount?: string | null
  postingPrescription?: string | null
  costCentre?: string | null
  activity?: string | null
  bankAccount?: string | null
  paymentForm?: string | null
  vatCountry?: string | null
  khSection?: string | null
  description?: string | null
}

const YES = "yes"
const NO = "no"

export function DocumentTypesView({
  slug,
  title,
  types,
  series,
  categories,
  kindsByCategory,
  favorite,
}: {
  slug: string
  title: string
  types: readonly DocumentTypeView[]
  series: readonly DocumentSeriesOption[]
  categories: readonly DocumentCategory[]
  kindsByCategory: Record<DocumentCategory, DocumentKind[]>
  favorite: ContentHeaderFavoriteToggle
}) {
  const tn = useTranslations("org.nav")
  const tcat = useTranslations("org.docCategory")
  const tk = useTranslations("accounting.documentTypes.kind")
  const tc = useTranslations("accounting.documentTypes.columns")
  const tp = useTranslations("accounting.documentTypes.page")
  const ti = useTranslations("accounting.documentTypes.inspector")
  const tb = useTranslations("accounting.documentTypes.boolean")
  const tcreate = useTranslations("accounting.documentTypes.create")

  const [activeTab, setActiveTab] = React.useState<string>(
    categories[0] ?? "RECEIVED_INVOICE",
  )
  const [search, setSearch] = React.useState("")
  const [drafts, setDrafts] = React.useState<Record<string, Draft>>({})
  const [createOpen, setCreateOpen] = React.useState(false)
  const [newCode, setNewCode] = React.useState("")
  const [newName, setNewName] = React.useState("")
  const [creating, setCreating] = React.useState(false)

  const activeCategory = activeTab as DocumentCategory
  const byId = React.useMemo(
    () => new Map(types.map((t) => [t.id, t])),
    [types],
  )

  // Every Druh code (all categories) → localized option, for the column display.
  const allKindOptions: TableColumnOption[] = React.useMemo(() => {
    const codes = new Set<DocumentKind>()
    for (const list of Object.values(kindsByCategory))
      for (const k of list) codes.add(k)
    return [...codes].map((k) => ({ value: k, label: tk(k) }))
  }, [kindsByCategory, tk])

  const boolOptions: TableColumnOption[] = React.useMemo(
    () => [
      { value: YES, label: tb("yes") },
      { value: NO, label: tb("no") },
    ],
    [tb],
  )

  const columns = React.useMemo<TableColumnSpec[]>(
    () => [
      { id: "code", header: tc("code"), kind: "text", role: "id", width: 160 },
      { id: "name", header: tc("name"), kind: "text", width: 300 },
      {
        id: "kind",
        header: tc("kind"),
        kind: "select",
        options: allKindOptions,
        width: 180,
      },
      { id: "series", header: tc("series"), kind: "text", width: 140 },
      {
        id: "primary",
        header: tc("primary"),
        kind: "badge",
        options: boolOptions,
        width: 120,
      },
      {
        id: "active",
        header: tc("active"),
        kind: "badge",
        options: boolOptions,
        width: 120,
      },
    ],
    [tc, allKindOptions, boolOptions],
  )

  const rows = React.useMemo<TableSectionRow[]>(
    () =>
      types
        .filter((t) => t.category === activeCategory)
        .map((t) => ({
          id: t.id,
          code: t.code,
          name: t.name,
          kind: t.kind ?? "",
          series: t.defaultSeriesCode ?? "",
          primary: t.isPrimary ? YES : NO,
          active: t.isActive ? YES : NO,
        })),
    [types, activeCategory],
  )

  const views: ViewTab[] = React.useMemo(
    () =>
      categories.map((cat) => ({
        value: cat,
        label: tcat(cat),
        count: types.filter((t) => t.category === cat).length,
      })),
    [categories, types, tcat],
  )

  const buildToolbar = React.useCallback(
    (
      table: Table<TableSectionRow> | null,
    ): ContentToolbarProps<TableSectionRow> =>
      buildTableToolbar(table, {
        search: { value: search, onChange: setSearch },
        add: {
          label: tcreate("new"),
          onAdd: () => {
            setNewCode("")
            setNewName("")
            setCreateOpen(true)
          },
        },
      }),
    [search, tcreate],
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
      const type = byId.get(String(row.id))
      if (!type) return {}
      const id = type.id
      const d = drafts[id] ?? {}
      // Key on PRESENCE, not nullishness: a draft that intentionally clears a
      // field to null must win over the stale server value (else the clear is
      // silently dropped and Save falsely reports success).
      const val = <K extends keyof Draft>(key: K): Draft[K] =>
        key in d ? d[key] : (type[key as keyof DocumentTypeView] as Draft[K])

      const kindOptions: TableColumnOption[] = (
        kindsByCategory[type.category] ?? []
      ).map((k) => ({ value: k, label: tk(k) }))
      const seriesOptions: TableColumnOption[] = series
        .filter((s) => s.category === type.category)
        .map((s) => ({ value: s.id, label: s.code }))

      const basic: InspectorKeyLine[] = [
        {
          label: ti("code"),
          value: type.code,
          icon: "HashIcon",
          readOnly: true,
        },
        {
          label: ti("name"),
          value: val("name") ?? "",
          onChange: (next) => patch(id, { name: next }),
        },
        {
          label: ti("kind"),
          value: val("kind") ?? "",
          type: "select",
          options: kindOptions,
          placeholder: ti("kindPlaceholder"),
          onChange: (next) =>
            patch(id, { kind: (next || null) as DocumentKind | null }),
        },
        {
          label: ti("series"),
          value: val("defaultSeriesId") ?? "",
          type: "select",
          options: seriesOptions,
          placeholder: ti("seriesPlaceholder"),
          onChange: (next) => patch(id, { defaultSeriesId: next || null }),
        },
        {
          label: ti("dueDays"),
          value: val("dueDays") ?? "",
          type: "number",
          onChange: (next) => {
            // Guard the parse: a text input can yield "abc" (NaN) or "1.5"; keep
            // a non-negative integer or null, never a NaN that the column rejects.
            const n = Number.parseInt(next, 10)
            patch(id, {
              dueDays:
                next.trim() === "" || Number.isNaN(n) ? null : Math.max(0, n),
            })
          },
        },
        {
          label: ti("paymentForm"),
          value: val("paymentForm") ?? "",
          onChange: (next) => patch(id, { paymentForm: next || null }),
        },
        {
          label: ti("bankAccount"),
          value: val("bankAccount") ?? "",
          onChange: (next) => patch(id, { bankAccount: next || null }),
        },
        {
          label: ti("primary"),
          value: type.isPrimary ? tb("yes") : tb("no"),
          readOnly: true,
          action: type.isPrimary
            ? undefined
            : {
                label: ti("setPrimary"),
                onClick: () => {
                  void setPrimaryType({
                    slug,
                    id,
                    category: type.category,
                  }).then((r) => {
                    if (!r.ok) toast.error(ti("actionError"))
                  })
                },
              },
        },
        {
          label: ti("active"),
          value: type.isActive ? tb("yes") : tb("no"),
          readOnly: true,
          action: {
            label: type.isActive ? ti("archive") : ti("restore"),
            onClick: () => {
              void setTypeActive({ slug, id, isActive: !type.isActive }).then(
                (r) => {
                  if (!r.ok) toast.error(ti("actionError"))
                },
              )
            },
          },
        },
      ]

      const posting: InspectorKeyLine[] = [
        {
          label: ti("defaultAccount"),
          value: val("defaultAccount") ?? "",
          onChange: (next) => patch(id, { defaultAccount: next || null }),
        },
        {
          label: ti("postingPrescription"),
          value: val("postingPrescription") ?? "",
          onChange: (next) => patch(id, { postingPrescription: next || null }),
        },
        {
          label: ti("costCentre"),
          value: val("costCentre") ?? "",
          onChange: (next) => patch(id, { costCentre: next || null }),
        },
        {
          label: ti("activity"),
          value: val("activity") ?? "",
          onChange: (next) => patch(id, { activity: next || null }),
        },
      ]

      const vat: InspectorKeyLine[] = [
        {
          label: ti("vatCountry"),
          value: val("vatCountry") ?? "",
          onChange: (next) => patch(id, { vatCountry: next || null }),
        },
        {
          label: ti("khSection"),
          value: val("khSection") ?? "",
          onChange: (next) => patch(id, { khSection: next || null }),
        },
        {
          label: ti("description"),
          value: val("description") ?? "",
          onChange: (next) => patch(id, { description: next || null }),
        },
      ]

      return {
        details: (
          <SectionList
            sections={[
              sectionInspectorKeyDetails({
                title: ti("sectionBasic"),
                lines: basic,
              }),
              sectionInspectorKeyDetails({
                title: ti("sectionPosting"),
                lines: posting,
              }),
              sectionInspectorKeyDetails({
                title: ti("sectionVat"),
                lines: vat,
              }),
            ]}
          />
        ),
      }
    },
    [byId, drafts, kindsByCategory, series, tk, ti, tb, slug, patch],
  )

  const onApprove = React.useCallback(
    (row: TableSectionRow) => {
      const type = byId.get(String(row.id))
      if (!type) return
      const d = drafts[type.id] ?? {}
      void saveDocumentType({
        slug,
        category: type.category,
        code: type.code,
        name: "name" in d ? (d.name ?? type.name) : type.name,
        kind: "kind" in d ? d.kind : type.kind,
        defaultSeriesId:
          "defaultSeriesId" in d ? d.defaultSeriesId : type.defaultSeriesId,
        defaultAccount:
          "defaultAccount" in d ? d.defaultAccount : type.defaultAccount,
        postingPrescription:
          "postingPrescription" in d
            ? d.postingPrescription
            : type.postingPrescription,
        costCentre: "costCentre" in d ? d.costCentre : type.costCentre,
        activity: "activity" in d ? d.activity : type.activity,
        bankAccount: "bankAccount" in d ? d.bankAccount : type.bankAccount,
        paymentForm: "paymentForm" in d ? d.paymentForm : type.paymentForm,
        dueDays: "dueDays" in d ? d.dueDays : type.dueDays,
        vatCountry: "vatCountry" in d ? d.vatCountry : type.vatCountry,
        khSection: "khSection" in d ? d.khSection : type.khSection,
        description: "description" in d ? d.description : type.description,
        validFromYear: type.validFromYear,
        validToYear: type.validToYear,
      }).then((r) => {
        if (r.ok) {
          setDrafts((prev) => {
            const { [type.id]: _drop, ...rest } = prev
            return rest
          })
          toast.success(ti("saved"))
        } else {
          toast.error(ti("saveError"))
        }
      })
    },
    [byId, drafts, slug, ti],
  )

  // A create is an upsert keyed on (category, Zkratka), so a duplicate code would
  // silently overwrite the existing type — block it in the form instead.
  const trimmedNewCode = newCode.trim()
  const duplicateCode = types.some(
    (t) => t.category === activeCategory && t.code === trimmedNewCode,
  )
  const canCreate =
    trimmedNewCode !== "" &&
    newName.trim() !== "" &&
    !duplicateCode &&
    !creating

  const onCreate = React.useCallback(() => {
    const code = newCode.trim()
    const name = newName.trim()
    if (!code || !name) return
    setCreating(true)
    void saveDocumentType({ slug, category: activeCategory, code, name }).then(
      (r) => {
        setCreating(false)
        if (r.ok) {
          setCreateOpen(false)
          toast.success(tcreate("created"))
        } else {
          toast.error(tcreate("createError"))
        }
      },
    )
  }, [newCode, newName, slug, activeCategory, tcreate])

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
        inspectorRowTitle={(row) => String(row.code ?? "")}
        inspectorRowName={(row) => String(row.name ?? "")}
        inspectorRowContent={inspectorContent}
        inspectorApproveLabel={ti("save")}
        onInspectorApprove={onApprove}
        sections={[
          sectionTable({
            anchor: "document-types",
            columns,
            rows,
            rowIdKey: "id",
            features: { search: true, inspect: true },
            emptyText: tp("empty"),
          }),
        ]}
      />
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tcreate("title")}</DialogTitle>
            <DialogDescription>
              {tcreate("description", { category: tcat(activeCategory) })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <Field data-invalid={duplicateCode ? true : undefined}>
              <FieldLabel htmlFor="new-type-code">{tcreate("code")}</FieldLabel>
              <Input
                id="new-type-code"
                autoFocus
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder={tcreate("codePlaceholder")}
              />
              {duplicateCode ? (
                <FieldError>{tcreate("duplicate")}</FieldError>
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="new-type-name">{tcreate("name")}</FieldLabel>
              <Input
                id="new-type-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={tcreate("namePlaceholder")}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCreateOpen(false)}
            >
              {tcreate("cancel")}
            </Button>
            <Button size="sm" disabled={!canCreate} onClick={onCreate}>
              {tcreate("submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
