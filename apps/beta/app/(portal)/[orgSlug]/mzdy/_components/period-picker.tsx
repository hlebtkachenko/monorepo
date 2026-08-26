import Link from "next/link"

import { Button } from "@workspace/ui/components/button"

import { getBetaTranslations } from "@/i18n/translations-server"
import type { ReportingPeriodView } from "@/lib/data/projections"
import { formatReportingPeriodLabel } from "@/lib/format/period-label"

import { PERIOD_PARAM } from "../_lib/period-selection"

/**
 * The Přehled mezd period picker — the same button-row shape
 * `vykazy/_components/dataset-header.tsx` renders for its three statements,
 * scoped to this page alone: Mzdy has no per-statement highlights or
 * staleness band to share the header with, so a whole `DatasetHeader` would
 * bring machinery this page does not use.
 */
export async function PeriodPicker({
  basePath,
  periods,
  current,
}: {
  basePath: string
  periods: readonly ReportingPeriodView[]
  current: ReportingPeriodView | null
}) {
  if (periods.length === 0) return null
  const t = await getBetaTranslations()

  return (
    <nav
      aria-label={t("mzdy.periodPickerLabel")}
      className="flex flex-wrap items-center gap-2"
    >
      <span className="text-sm text-muted-foreground">
        {t("mzdy.periodPickerLabel")}
      </span>
      {periods.map((period) => (
        <Link
          key={period.id}
          href={`${basePath}?${PERIOD_PARAM}=${period.id}`}
          scroll={false}
        >
          <Button
            variant={period.id === current?.id ? "secondary" : "outline"}
            size="sm"
          >
            {formatReportingPeriodLabel(period)}
          </Button>
        </Link>
      ))}
    </nav>
  )
}
