"use client"

import { useState } from "react"

import { PeriodSwitcher } from "@workspace/ui/blocks/app-header"

/**
 * Accounting-period switcher surface wrapper — feeds the presentational
 * `PeriodSwitcher` (packages/ui) its data + holds the selection.
 *
 * ── DATA SEAM (MOCK for visual review) ───────────────────────────────────
 * There is NO accounting-period backend yet: the schema has only
 * `organization.fiscal_year_start_month` (a single smallint), no per-period
 * records or closed/locked state. Wire real data here when the
 * `accounting_period` table exists (tracked in GitHub issue #406; backend in
 * PR #386 `ucetni_obdobi` → od/do/stav, superseded by the v2 line PR #395):
 *
 *  • periods  → one row per period for the org: id, start/end month + year
 *    (derived from `fiscal_year_start_month` + the period year), and a
 *    `closed` flag (period lock). Format with `toPeriod` below.
 *  • value / onValueChange → the active period; persist the choice (cookie /
 *    GUC) so it scopes the org's reads.
 *  • onAddPeriod → open the "create accounting period" flow.
 */
interface RawPeriod {
  id: string
  fromMonth: number
  fromYear: number
  toMonth: number
  toYear: number
  closed: boolean
}

const pad = (m: number) => String(m).padStart(2, "0")

/**
 * Format a raw period into the switcher shape. `label` is the full
 * `MM.YYYY – MM.YYYY` range (dropdown); `headerLabel` collapses to just the
 * year when the period is a full calendar year (Jan–Dec, same year), else the
 * full range — so the header trigger stays compact for the common case.
 */
function toPeriod(p: RawPeriod) {
  const label = `${pad(p.fromMonth)}.${p.fromYear} – ${pad(p.toMonth)}.${p.toYear}`
  const isCalendarYear =
    p.fromMonth === 1 && p.toMonth === 12 && p.fromYear === p.toYear
  return {
    id: p.id,
    label,
    headerLabel: isCalendarYear ? String(p.fromYear) : label,
    closed: p.closed,
  }
}

const MOCK_PERIODS = (
  [
    {
      id: "2026",
      fromMonth: 1,
      fromYear: 2026,
      toMonth: 12,
      toYear: 2026,
      closed: false,
    },
    {
      id: "2025",
      fromMonth: 1,
      fromYear: 2025,
      toMonth: 12,
      toYear: 2025,
      closed: true,
    },
    {
      id: "2024",
      fromMonth: 1,
      fromYear: 2024,
      toMonth: 12,
      toYear: 2024,
      closed: true,
    },
  ] satisfies RawPeriod[]
).map(toPeriod)

export function PeriodSwitcherClient() {
  const [value, setValue] = useState("2026")

  return (
    <PeriodSwitcher
      periods={MOCK_PERIODS}
      value={value}
      onValueChange={setValue}
      onAddPeriod={() => {
        // MOCK — wire the "create accounting period" flow here.
      }}
      onManagePeriods={() => {
        // MOCK — wire the period-management surface here.
      }}
    />
  )
}
