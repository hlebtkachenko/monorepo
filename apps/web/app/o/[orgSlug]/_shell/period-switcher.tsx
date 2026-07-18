"use client"

import { useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { PeriodSwitcher } from "@workspace/ui/blocks/app-header"

import { orgBasePath, orgHref } from "@/lib/org/href"
import { setPeriodDefault } from "@/lib/org/period-actions"
import type { HeaderPeriod } from "@/lib/org/period"

const pad = (m: number) => String(m).padStart(2, "0")

/**
 * Format a DB period row into the switcher shape. `label` is the full
 * `MM.YYYY – MM.YYYY` range; `headerLabel` collapses to the year for a full
 * calendar year, else the full range. `closed` is the period lock.
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

/**
 * Period switcher for the rebuilt tree. The URL is the single source of truth:
 * the active value reads live from `?period=` (falling back to the server
 * default the layout resolved from the cookie), and selecting a period pushes a
 * new URL that carries `?period=` while preserving the current in-org path. The
 * cookie is updated as a best-effort sticky default via `setPeriodDefault`; it
 * is never authoritative. This removes the old tree's fire-and-forget optimistic
 * state and per-page cookie re-derivation.
 */
export function PeriodSwitcherClient({
  slug,
  periods,
  defaultPeriodId,
}: {
  slug: string
  periods: HeaderPeriod[]
  defaultPeriodId: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const value = searchParams.get("period") ?? defaultPeriodId
  const items = periods.map(toPeriod)

  // The current path relative to the org base, so switching a period keeps you
  // on the same page instead of bouncing to the org home.
  function relativePath() {
    const base = orgBasePath(slug)
    const path = pathname ?? base
    return path.startsWith(base)
      ? path.slice(base.length).replace(/^\/+/, "")
      : ""
  }

  function selectPeriod(id: string) {
    startTransition(() => {
      router.push(orgHref(slug, relativePath(), { period: id }))
    })
    // Persist as the sticky default for a later plain navigation; best-effort.
    void setPeriodDefault(id)
  }

  return (
    <PeriodSwitcher
      periods={items}
      value={value}
      onValueChange={selectPeriod}
      onAddPeriod={() => router.push(orgHref(slug, "settings/periods"))}
      onManagePeriods={() => router.push(orgHref(slug, "settings/periods"))}
    />
  )
}
