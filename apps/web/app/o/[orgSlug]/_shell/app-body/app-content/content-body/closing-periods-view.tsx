"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import type { Table } from "@tanstack/react-table"

import type {
  CloseCheckStatus,
  FxRateKind,
  PeriodCloseCheck,
} from "@workspace/accounting"
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
import type {
  ActionDescriptor,
  ContentFooterAction,
  ContentHeaderFavoriteToggle,
  ContentToolbarProps,
  SectionCellCommit,
  TableColumnOption,
  TableColumnSpec,
  TableSectionRow,
  TreeTableRow,
  ViewTab,
} from "@workspace/ui/blocks/content-panel"
import type { InspectorTab } from "@workspace/ui/blocks/inspector-sheet"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import type { FiltersState } from "@workspace/ui/components/filter-bar"
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
import { Textarea } from "@workspace/ui/components/textarea"

import {
  getPeriodCloseReadinessAction,
  openPeriodAction,
  reopenPeriodAction,
  updatePeriodZkratka,
  type PeriodCloseReadinessView,
} from "@/lib/org/period-actions"
import type { PeriodListRow } from "@/lib/org/period-data"

/**
 * ClosingPeriodsView — the Closing → Účetní období list.
 *
 * A **Tree-table** archetype section (the #892 variant) over the org's real
 * `accounting_period` rows (projected server-side by `listPeriods`). The fiscal
 * years are the top-level rows; the monthly sub-periods join later as `subRows`,
 * so the year → month hierarchy is built on the tree renderer from the start.
 *
 * Columns: Rok (the fiscal year — the row's STABLE identity, so it hosts the
 * tree anchor and is never editable), Zkratka (the period code — inline-editable,
 * defaults to the derived fiscal year until overridden), Od / Do (bounds), Stav
 * (Aktivní / Otevřené / Uzavřené). Editing Zkratka commits through the tree
 * renderer's own optimistic cell state: it shows the edit immediately and reverts
 * if `updatePeriodZkratka` rejects (this handler throws on `!ok`). No demo
 * content — every cell is real org data.
 *
 * Row Inspector (Details): `ArchetypeTable` resolves the inspected row from the
 * tree forest by node id, so the tree section opts in with `inspect: true`. The
 * Details tab is a read-only detail of the period (Období, Stav, Rok, regime,
 * currency, fx policy); Zkratka stays editable through the same
 * `updatePeriodZkratka` action the inline cell uses.
 *
 * "Otevřít období" (toolbar, owner/admin) opens the next účetní období from the
 * newest one: a small dialog collects the počátek/konec bounds (defaulted to the
 * following year) plus an optional currency + fx override, then calls
 * `openPeriodAction`, which copies the prior period's regime/currency/fx forward.
 */

/** Fx policies offered when opening a period (matches the column's DAILY | FIXED
 *  documented policy domain; `""` = inherit the prior period's value). */
const FX_POLICY_CHOICES = ["DAILY", "FIXED"] as const

/** Narrow a Select value to a real fx policy (its options are the only source). */
function isFxChoice(value: string): value is FxRateKind {
  return (FX_POLICY_CHOICES as readonly string[]).includes(value)
}

/** Add `days` to an ISO `YYYY-MM-DD` date, returning an ISO date (UTC-anchored). */
function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** The last day of the 12-month span that starts on `startIso` (start + 1y − 1d). */
function oneYearEndIso(startIso: string): string {
  const date = new Date(`${startIso}T00:00:00Z`)
  date.setUTCFullYear(date.getUTCFullYear() + 1)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

/**
 * Inspector "Uzávěrka" tab — the period-close readiness checklist plus the run
 * entry for one selected period. It fetches readiness on mount (and whenever the
 * inspected period changes) via `getPeriodCloseReadinessAction`, then renders the
 * domain checks split by severity: BLOCKER checks first, WARNING checks below,
 * each with a status badge. An OPEN period shows "Spustit uzávěrku" for
 * owner/admin (the DTO's `canManage` flag) linking to the close wizard route; a
 * CLOSED period shows a closed notice and leaves a seam for the P12 reopen entry.
 * The check `label`/`message` render as-is from the domain (their localization is
 * out of scope); only the tab chrome is translated.
 */
function PeriodUzaverkaTab({
  slug,
  periodId,
  stav,
}: {
  slug: string
  periodId: string
  stav: string
}) {
  const t = useTranslations("org.periods")
  const router = useRouter()
  const [loading, setLoading] = React.useState(true)
  const [failed, setFailed] = React.useState(false)
  const [readiness, setReadiness] =
    React.useState<PeriodCloseReadinessView | null>(null)

  React.useEffect(() => {
    let ignore = false
    setLoading(true)
    setFailed(false)
    setReadiness(null)
    void (async () => {
      const result = await getPeriodCloseReadinessAction({ slug, periodId })
      if (ignore) return
      if (result.ok) setReadiness(result.readiness)
      else setFailed(true)
      setLoading(false)
    })()
    return () => {
      ignore = true
    }
  }, [slug, periodId])

  const isClosed = stav === "closed"

  // Reopen ("storno" of the year-end close) — the single riskiest period write,
  // so it is confirm-gated. The button is rendered only for owner/admin (the
  // DTO's `canManage`); the action re-checks authz + injects `reopenedBy`.
  const [reopenOpen, setReopenOpen] = React.useState(false)
  const [reopenReason, setReopenReason] = React.useState("")
  const [reopening, startReopen] = React.useTransition()

  const submitReopen = React.useCallback(() => {
    startReopen(async () => {
      const result = await reopenPeriodAction({
        slug,
        periodId,
        reason: reopenReason.trim() || undefined,
      })
      if (result.ok) {
        setReopenOpen(false)
        toast.success(t("uzaverka.reopen.success"))
        router.refresh()
        return
      }
      if ("forbidden" in result && result.forbidden) {
        toast.error(t("uzaverka.reopen.forbidden"))
      } else if ("blocked" in result && result.blocked) {
        toast.error(t("uzaverka.reopen.blocked"))
      } else {
        toast.error(t("uzaverka.reopen.error"))
      }
    })
  }, [slug, periodId, reopenReason, t, router])

  const statusLabel = React.useCallback(
    (status: CloseCheckStatus): string =>
      status === "PASS"
        ? t("uzaverka.status.pass")
        : status === "FAIL"
          ? t("uzaverka.status.fail")
          : t("uzaverka.status.unavailable"),
    [t],
  )

  // Per-check status → badge tone. Severity (BLOCKER vs WARNING) is conveyed by
  // the section a check sits in; the badge reports its individual status.
  const statusVariant = (status: CloseCheckStatus) =>
    status === "PASS"
      ? ("secondary" as const)
      : status === "FAIL"
        ? ("destructive" as const)
        : ("outline" as const)

  const renderCheck = (check: PeriodCloseCheck) => (
    <li
      key={check.code}
      className="flex items-start justify-between gap-3 rounded-lg border border-border-subtle px-3 py-2"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{check.label}</p>
        <p className="text-xs text-muted-foreground">{check.message}</p>
      </div>
      <Badge variant={statusVariant(check.status)}>
        {statusLabel(check.status)}
      </Badge>
    </li>
  )

  const blockers =
    readiness?.checks.filter((check) => check.severity === "BLOCKER") ?? []
  const warnings =
    readiness?.checks.filter((check) => check.severity !== "BLOCKER") ?? []

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          {t("uzaverka.heading")}
        </h3>
        {readiness && !isClosed ? (
          <Badge variant={readiness.ready ? "default" : "destructive"}>
            {readiness.ready ? t("uzaverka.ready") : t("uzaverka.notReady")}
          </Badge>
        ) : null}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground" role="status">
          {t("uzaverka.loading")}
        </p>
      ) : null}
      {failed ? (
        <p className="text-sm text-destructive" role="alert">
          {t("uzaverka.error")}
        </p>
      ) : null}

      {readiness ? (
        <div className="flex flex-col gap-4">
          {blockers.length > 0 ? (
            <section className="space-y-2">
              <h4 className="text-xs font-semibold text-foreground">
                {t("uzaverka.blockers")}
              </h4>
              <ul className="space-y-2">{blockers.map(renderCheck)}</ul>
            </section>
          ) : null}
          {warnings.length > 0 ? (
            <section className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground">
                {t("uzaverka.warnings")}
              </h4>
              <ul className="space-y-2">{warnings.map(renderCheck)}</ul>
            </section>
          ) : null}
        </div>
      ) : null}

      {isClosed ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            {t("uzaverka.closed")}
          </p>
          {readiness?.canManage ? (
            <AlertDialog open={reopenOpen} onOpenChange={setReopenOpen}>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" className="self-end">
                  {t("uzaverka.reopen.action")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t("uzaverka.reopen.title")}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("uzaverka.reopen.description")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="reopen-reason">
                    {t("uzaverka.reopen.reasonLabel")}
                  </Label>
                  <Textarea
                    id="reopen-reason"
                    value={reopenReason}
                    onChange={(e) => setReopenReason(e.target.value)}
                    placeholder={t("uzaverka.reopen.reasonPlaceholder")}
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={reopening}>
                    {t("uzaverka.reopen.cancel")}
                  </AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    disabled={reopening}
                    onClick={(e) => {
                      e.preventDefault()
                      submitReopen()
                    }}
                  >
                    {t("uzaverka.reopen.confirm")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>
      ) : readiness?.canManage ? (
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() =>
              router.push(`/${slug}/closing/periods/${periodId}/close`)
            }
          >
            {t("uzaverka.run")}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export function ClosingPeriodsView({
  slug,
  title,
  rows: serverRows,
  favorite,
}: {
  slug: string
  title: string
  rows: readonly PeriodListRow[]
  favorite: ContentHeaderFavoriteToggle
}) {
  const t = useTranslations("org.periods")
  const router = useRouter()
  const [activeTab, setActiveTab] = React.useState("all")
  const [search, setSearch] = React.useState("")
  const [filters, setFilters] = React.useState<FiltersState>([])

  // Wrap the flat period rows as a Tree-table forest: top-level = fiscal years,
  // each period's cells under `values` keyed by column id (month sub-rows join as
  // `subRows` in a later slice). `id`, `regime`, `currency`, `fxPolicy` ride along
  // in `values` (unrendered as columns) so the Inspector — which resolves the row
  // from the tree node's `values` — can read them.
  const treeRows = React.useMemo<readonly TreeTableRow[]>(
    () =>
      serverRows.map((row) => ({
        id: row.id,
        values: {
          id: row.id,
          rok: row.rok,
          zkratka: row.zkratka,
          od: row.od,
          do: row.do,
          stav: row.stav,
          regime: row.regime,
          currency: row.currency,
          fxPolicy: row.fxPolicy,
        },
      })),
    [serverRows],
  )

  const stavOptions: TableColumnOption[] = React.useMemo(
    () => [
      { value: "active", label: t("stav.active") },
      { value: "open", label: t("stav.open") },
      { value: "closed", label: t("stav.closed") },
    ],
    [t],
  )

  const columns: TableColumnSpec[] = React.useMemo(
    () => [
      // Rok is the stable identity → the tree anchor (chevron + expand), never
      // inline-editable. A user-editable Zkratka cannot serve as the anchor.
      {
        id: "rok",
        header: t("columns.rok"),
        kind: "text",
        role: "id",
        width: 160,
      },
      {
        id: "zkratka",
        header: t("columns.zkratka"),
        kind: "text",
        edit: "inline",
        width: 160,
      },
      { id: "od", header: t("columns.od"), kind: "text", width: 150 },
      { id: "do", header: t("columns.do"), kind: "text", width: 150 },
      {
        id: "stav",
        header: t("columns.stav"),
        kind: "badge",
        options: stavOptions,
        width: 150,
      },
    ],
    [t, stavOptions],
  )

  // View tabs filter the top-level (year) rows by lifecycle state.
  const tabRows = React.useMemo(() => {
    if (activeTab === "open")
      return treeRows.filter((row) => String(row.values.stav) !== "closed")
    if (activeTab === "closed")
      return treeRows.filter((row) => String(row.values.stav) === "closed")
    return treeRows
  }, [treeRows, activeTab])

  // Column-driven toolbar filter + the recursively-narrowed tree it produces.
  const { filter, rows: filteredTree } = useTreeTableFilters({
    columns,
    rows: tabRows,
    filters,
    onFiltersChange: setFilters,
  })

  const views: ViewTab[] = React.useMemo(
    () => [
      { value: "all", label: t("views.all"), count: treeRows.length },
      {
        value: "open",
        label: t("views.open"),
        count: treeRows.filter((row) => String(row.values.stav) !== "closed")
          .length,
      },
      {
        value: "closed",
        label: t("views.closed"),
        count: treeRows.filter((row) => String(row.values.stav) === "closed")
          .length,
      },
    ],
    [treeRows, t],
  )

  // Persist a Zkratka edit through the shared server action. Revalidation on the
  // server refreshes the list; a rejection surfaces as a toast.
  const [, startSaving] = React.useTransition()
  const commitZkratka = React.useCallback(
    (periodId: string, raw: string) => {
      const next = raw.trim()
      if (!next || !periodId) return
      startSaving(async () => {
        const result = await updatePeriodZkratka({
          slug,
          periodId,
          zkratka: next,
        })
        if (!result.ok) toast.error(t("editZkratkaError"))
      })
    },
    [slug, t],
  )

  // Inline-cell variant: throwing on failure makes the tree renderer revert the
  // optimistic cell. Only Zkratka is editable; other columns are read-only.
  const onCellEdit: SectionCellCommit = React.useCallback(
    async ({ rowId, columnId, value }) => {
      if (columnId !== "zkratka") return
      const next = String(value ?? "").trim()
      if (!next) throw new Error("empty zkratka") // revert, no toast
      const result = await updatePeriodZkratka({
        slug,
        periodId: rowId,
        zkratka: next,
      })
      if (!result.ok) {
        toast.error(t("editZkratkaError"))
        throw new Error("zkratka update rejected") // revert the optimistic cell
      }
    },
    [slug, t],
  )

  // ── Inspector Details: read-only period detail; Zkratka editable via the same
  // action as the inline cell. Labels reuse the column i18n; regime / stav / fx
  // enums map to their localized labels. The row is the tree node's `values`.
  const stavLabel = React.useCallback(
    (value: string | number | null | undefined) => {
      const key = String(value ?? "")
      return key === "active" || key === "open" || key === "closed"
        ? t(`stav.${key}`)
        : "—"
    },
    [t],
  )
  const regimeLabel = React.useCallback(
    (value: string | number | null | undefined) => {
      const key = String(value ?? "")
      return key === "DOUBLE_ENTRY" ||
        key === "SINGLE_ENTRY" ||
        key === "TAX_RECORDS"
        ? t(`regime.${key}`)
        : key || "—"
    },
    [t],
  )
  const fxLabel = React.useCallback(
    (value: string | number | null | undefined) => {
      const key = String(value ?? "")
      if (key === "") return t("fx.default")
      return key === "DAILY" || key === "REAL" || key === "FIXED"
        ? t(`fx.${key}`)
        : key
    },
    [t],
  )

  const inspectorContent = React.useCallback(
    (row: TableSectionRow): Partial<Record<InspectorTab, React.ReactNode>> => {
      const id = String(row.id ?? "")
      return {
        details: (
          <SectionList
            sections={[
              sectionInspectorKeyDetails({
                lines: [
                  {
                    label: t("columns.rok"),
                    value: String(row.rok ?? ""),
                    readOnly: true,
                  },
                  {
                    label: t("columns.zkratka"),
                    value: String(row.zkratka ?? ""),
                    onCommit: (v) => commitZkratka(id, v),
                  },
                  {
                    label: t("columns.od"),
                    value: String(row.od ?? ""),
                    readOnly: true,
                  },
                  {
                    label: t("columns.do"),
                    value: String(row.do ?? ""),
                    readOnly: true,
                  },
                  {
                    label: t("columns.stav"),
                    value: stavLabel(row.stav),
                    readOnly: true,
                  },
                  {
                    label: t("details.regime"),
                    value: regimeLabel(row.regime),
                    readOnly: true,
                  },
                  {
                    label: t("details.currency"),
                    value: String(row.currency ?? ""),
                    readOnly: true,
                  },
                  {
                    label: t("details.fx"),
                    value: fxLabel(row.fxPolicy),
                    readOnly: true,
                  },
                ],
              }),
            ]}
          />
        ),
        // The Inspector rail exposes a fixed tab union with no dedicated close
        // slot, so the Uzávěrka tab rides the cross-cutting "more" slot — the
        // most semantically appropriate existing slot for a secondary,
        // action-oriented panel on the record.
        more: (
          <PeriodUzaverkaTab
            slug={slug}
            periodId={id}
            stav={String(row.stav ?? "")}
          />
        ),
      }
    },
    [t, slug, commitZkratka, stavLabel, regimeLabel, fxLabel],
  )

  // ── "Otevřít období": create the next period from the newest one (rows are
  // newest-first). Disabled with no prior period — the first period is seeded at
  // org provisioning, not here.
  const newest = serverRows[0]
  const [createOpen, setCreateOpen] = React.useState(false)
  const [startDate, setStartDate] = React.useState("")
  const [endDate, setEndDate] = React.useState("")
  const [currency, setCurrency] = React.useState("")
  const [fxPolicy, setFxPolicy] = React.useState<"" | FxRateKind>("")
  const [creating, startCreating] = React.useTransition()

  const openCreate = React.useCallback(() => {
    if (!newest) return
    const nextStart = addDaysIso(newest.periodEndIso, 1)
    setStartDate(nextStart)
    setEndDate(oneYearEndIso(nextStart))
    setCurrency(newest.currency)
    setFxPolicy(newest.fxPolicy ?? "")
    setCreateOpen(true)
  }, [newest])

  const submitCreate = React.useCallback(() => {
    if (!newest || !startDate || !endDate) return
    startCreating(async () => {
      const result = await openPeriodAction({
        slug,
        priorPeriodId: newest.id,
        periodStart: startDate,
        periodEnd: endDate,
        accountingCurrency: currency.trim() || undefined,
        fxRatePolicy: fxPolicy || undefined,
      })
      if (!result.ok) {
        const forbidden = "forbidden" in result && result.forbidden
        toast.error(forbidden ? t("open.forbidden") : t("open.error"))
        return
      }
      setCreateOpen(false)
      toast.success(t("open.success"))
      router.refresh()
    })
  }, [newest, slug, startDate, endDate, currency, fxPolicy, t, router])

  const toolbarActions = React.useMemo<ActionDescriptor[]>(
    () => [
      {
        id: "open-period",
        label: t("open.action"),
        icon: "Plus",
        variant: "default",
        disabled: !newest,
        onSelect: openCreate,
      },
    ],
    [t, newest, openCreate],
  )

  const buildToolbar = React.useCallback(
    (
      table: Table<TableSectionRow> | null,
    ): ContentToolbarProps<TableSectionRow> =>
      buildTableToolbar(table, {
        search: { value: search, onChange: setSearch },
        filter,
        actions: toolbarActions,
      }),
    [search, filter, toolbarActions],
  )

  const selectionActions = React.useCallback(
    (
      table: Table<TableSectionRow> | null,
      _helpers: ArchetypeTableSelectionHelpers,
    ): ContentFooterAction[] => {
      // `flatRows` so a nested (month) selection is included alongside years.
      const ids = (table?.getFilteredSelectedRowModel().flatRows ?? []).map(
        (row) => String(row.original.id),
      )
      return buildTableFooter(table, {
        exportFileName: t("exportFileName"),
        selectedIds: ids,
      })
    },
    [t],
  )

  return (
    <>
      <ArchetypeTable<TableSectionRow>
        title={title}
        favorite={favorite}
        views={{ tabs: views, value: activeTab, onValueChange: setActiveTab }}
        toolbar={buildToolbar}
        selectionActions={selectionActions}
        onCellEdit={onCellEdit}
        inspectorRowTitle={(row) => String(row.rok ?? "")}
        inspectorRowName={(row) => String(row.zkratka ?? row.rok ?? "")}
        inspectorRowContent={inspectorContent}
        sections={[
          sectionTreeTable({
            anchor: "periods",
            columns,
            rows: filteredTree,
            features: { search: true, inspect: true },
            emptyText: t("empty"),
          }),
        ]}
      />
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("open.title")}</DialogTitle>
            <DialogDescription>{t("open.description")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="period-start">{t("open.startLabel")}</Label>
                <Input
                  id="period-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="period-end">{t("open.endLabel")}</Label>
                <Input
                  id="period-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="period-currency">
                  {t("open.currencyLabel")}
                </Label>
                <Input
                  id="period-currency"
                  value={currency}
                  maxLength={3}
                  autoCapitalize="characters"
                  onChange={(e) =>
                    setCurrency(e.target.value.toUpperCase().slice(0, 3))
                  }
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="period-fx">{t("open.fxLabel")}</Label>
                <Select
                  value={fxPolicy || "inherit"}
                  onValueChange={(v) => setFxPolicy(isFxChoice(v) ? v : "")}
                >
                  <SelectTrigger id="period-fx">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inherit">{t("fx.inherit")}</SelectItem>
                    {FX_POLICY_CHOICES.map((choice) => (
                      <SelectItem key={choice} value={choice}>
                        {t(`fx.${choice}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={creating}
              onClick={() => setCreateOpen(false)}
            >
              {t("open.cancel")}
            </Button>
            <Button
              disabled={creating || !startDate || !endDate}
              onClick={submitCreate}
            >
              {t("open.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
