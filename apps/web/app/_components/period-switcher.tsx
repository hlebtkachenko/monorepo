"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import { PeriodSwitcher } from "@workspace/ui/blocks/app-header"

import { setActivePeriodAction } from "../[orgSlug]/_lib/period-actions"
import type { HeaderPeriod } from "@/lib/org/header-periods"

/**
 * Accounting-period switcher surface wrapper — feeds the presentational
 * `PeriodSwitcher` (packages/ui) its data + owns the (optimistic) selection.
 *
 * Real data seam: the org layout fetches the org's periods + the active id
 * (server-side, org-scoped) and passes them in. Selection is persisted
 * server-side in the `afframe_period` cookie via `setActivePeriodAction`; the
 * handlers stay here in the client wrapper because functions are not
 * serializable across the server→client boundary.
 */
const pad = (m: number) => String(m).padStart(2, "0")

/**
 * Format a DB period row into the switcher shape. `label` is the full
 * `MM.YYYY – MM.YYYY` range (dropdown); `headerLabel` collapses to just the
 * year when the period is a full calendar year (Jan–Dec, same year), else the
 * full range — so the header trigger stays compact for the common case.
 * `closed` is the period lock (`status !== "OPEN"`).
 */
function toPeriod(p: HeaderPeriod) {
  const fromYear = Number(p.period_start.slice(0, 4))
  const fromMonth = Number(p.period_start.slice(5, 7))
  const toYear = Number(p.period_end.slice(0, 4))
  const toMonth = Number(p.period_end.slice(5, 7))
  const label = `${pad(fromMonth)}.${fromYear} – ${pad(toMonth)}.${toYear}`
  const isCalendarYear =
    fromMonth === 1 && toMonth === 12 && fromYear === toYear
  return {
    id: p.id,
    label,
    headerLabel: isCalendarYear ? String(fromYear) : label,
    closed: p.status !== "OPEN",
  }
}

export function PeriodSwitcherClient({
  orgSlug,
  periods,
  activePeriodId,
}: {
  orgSlug: string
  periods: HeaderPeriod[]
  activePeriodId: string
}) {
  const router = useRouter()
  const [value, setValue] = useState(activePeriodId)

  const items = periods.map(toPeriod)

  function selectPeriod(id: string) {
    setValue(id)
    // Persist server-side; optimistic local state already updated the trigger.
    void setActivePeriodAction(orgSlug, id)
  }

  return (
    <PeriodSwitcher
      periods={items}
      value={value}
      onValueChange={selectPeriod}
      onAddPeriod={() => router.push(`/${orgSlug}/settings/periods`)}
      onManagePeriods={() => router.push(`/${orgSlug}/settings/periods`)}
    />
  )
}
