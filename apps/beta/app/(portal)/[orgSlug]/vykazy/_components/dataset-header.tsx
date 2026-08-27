import Link from "next/link"

import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"

import { getBetaTranslations } from "@/i18n/translations-server"
import type { BetaMessageKey } from "@/i18n/messages"
import { formatDateTime } from "@/lib/format/date"
import { formatBetaAmount } from "@/lib/format/money"
import { formatReportingPeriodLabel } from "@/lib/format/period-label"

import { PageHeader } from "../../../../_components/page-header"

import type { DatasetView } from "../_lib/load-dataset"
import type { StatementHighlight } from "../_lib/highlights"
import { PERIOD_PARAM, isStale } from "../_lib/period-selection"

/**
 * Everything above a statement's table: the period picker, the §0.4 freshness
 * stamp, the staleness band, and the top strip of key rows.
 *
 * ONE COMPONENT FOR ALL THREE STATEMENTS, because §0.4's contract is per
 * DATASET and must not be re-decided per page. The pieces it renders are the
 * whole of what the client needs in order to trust a number: which period this
 * is, when the office published it, whether it came from the agent or from a
 * file, and whether a newer period exists that has not been sent.
 *
 * A Server Component: it renders only links and text, so making it a Client
 * Component would ship the period list to the browser for nothing.
 */
export async function DatasetHeader({
  basePath,
  titleKey,
  view,
  highlights = [],
}: {
  /** The tab's own org-scoped path, so picker links stay on this statement. */
  basePath: string
  titleKey: BetaMessageKey
  view: DatasetView
  highlights?: readonly StatementHighlight[]
}) {
  const t = await getBetaTranslations()
  const { periods, period, batch, behind } = view
  const newest = periods[0]

  return (
    <div className="grid gap-4">
      <PageHeader
        title={t(titleKey)}
        actions={
          batch ? (
            <p className="text-xs text-muted-foreground">
              {/*
                THE SOURCE IS PART OF THE STAMP, not decoration. An agent-fed
                batch and a manual CSV drop fail in different ways (spec §3.2
                records them apart for exactly that reason), and a client asking
                "why is this number odd" is better served by knowing which.
              */}
              {t("vykazy.publishedAt")} {formatDateTime(batch.publishedAt)} ·{" "}
              {t(
                batch.source === "agent"
                  ? "vykazy.sourceAgent"
                  : "vykazy.sourceManual",
              )}
            </p>
          ) : null
        }
      />

      {periods.length > 0 ? (
        <nav
          aria-label={t("vykazy.periodPickerLabel")}
          className="flex flex-wrap items-center gap-2"
        >
          <span className="text-sm text-muted-foreground">
            {t("vykazy.periodPickerLabel")}
          </span>
          {periods.map((option) => (
            <Link
              key={option.id}
              href={`${basePath}?${PERIOD_PARAM}=${option.id}`}
              scroll={false}
            >
              <Button
                variant={option.id === period?.id ? "secondary" : "outline"}
                size="sm"
              >
                {formatReportingPeriodLabel(option)}
              </Button>
            </Link>
          ))}
        </nav>
      ) : null}

      {isStale(behind) && newest ? (
        <Alert>
          <AlertDescription>
            {t("vykazy.staleBandPrefix")} {formatReportingPeriodLabel(newest)}
            {t("vykazy.staleBandSuffix")}
          </AlertDescription>
        </Alert>
      ) : null}

      {highlights.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {highlights.map((highlight) => (
            <Card key={highlight.labelKey}>
              <CardContent className="grid gap-1 py-4">
                <span className="text-xs text-muted-foreground">
                  {t(highlight.labelKey)}
                </span>
                <span className="font-heading text-lg font-semibold tabular-nums">
                  {formatBetaAmount(highlight.value)}
                </span>
                <Badge variant="outline" className="justify-self-start">
                  {t("vykazy.unitCzk")}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  )
}
