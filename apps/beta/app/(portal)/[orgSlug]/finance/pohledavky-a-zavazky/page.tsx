import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { formatAmount, formatDateTime } from "@/i18n/format-values"
import { getBetaTranslations } from "@/i18n/translations-server"
import { saldokontoForScope } from "@/lib/data/partners"
import { betaTodayIso } from "@/lib/format/date"
import { formatReportingPeriodLabel } from "@/lib/format/period-label"
import { freshnessBand } from "@/lib/freshness"

import { EntrySheet } from "../../_components/entry-sheet"
import { ManualBatchPeriodFields } from "../../_components/manual-batch-period-fields"
import { resolveOrgScope } from "../../_lib/org-scope"
import { startManualBatchAction } from "../../pro-ucetni/_actions/uzaverka"
import { START_MANUAL_BATCH_IDLE } from "../../pro-ucetni/_actions/uzaverka-state"

import { PartnerSaldoTable } from "./_components/partner-saldo-table"

/**
 * Finance › Pohledávky a závazky (spec §2.4) — the saldokonto, per partner.
 *
 * READ-ONLY FOR EVERY ROLE BUT THE OWNER, and even for the owner only
 * indirectly. There is still no "Upravit" affordance and no row is ever typed
 * IN PLACE here: a saldokonto is published by the office's agent through the
 * import spine (§3.2), and correcting one still means publishing a new batch
 * over it. The one OWNER-ONLY trigger (manual-entry plan §3, W1) only STARTS
 * an empty draft batch and sends the office straight to its own preview at
 * `pro-ucetni/uzaverka/[batchId]` — the same batch-draft path the agent's own
 * ingestion writes through (`import_batch.source = "manual"` is the only
 * difference), never a parallel write path.
 *
 * NOTHING IS COMPUTED HERE. The two totals are SQL window sums over exactly the
 * rows shown, the aging band is a SQL `CASE` over `CURRENT_DATE - oldest_due`,
 * and every figure is the string Postgres produced. This page picks Czech words
 * and a layout (§0.2).
 *
 * THE NEWEST PUBLISHED PERIOD, AND NO PICKER. §2.4 stamps this surface with "the
 * import period" and — unlike Výkazy (§2.5) — gives it no period picker: a
 * saldokonto is a position as of a date, and the question a client opens the
 * page with is who owes what now.
 *
 * EMPTY BEATS STALE (§0.4), in two different states that must not be confused:
 * an organization the office has never sent a saldokonto for renders "zatím
 * nebylo nahráno", and a published batch with no partners in it renders a
 * different sentence. Only one of them means "nobody owes anything", and it is
 * the second.
 */
export default async function PohledavkyAZavazkyPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const scope = await resolveOrgScope(orgSlug)

  const [t, view] = await Promise.all([
    getBetaTranslations(),
    saldokontoForScope(scope),
  ])

  // §0.4's warning band: the newest published period lags the current one by
  // more than one. `lib/freshness.ts` is the shared implementation of that one
  // sentence, and it takes today as a parameter so its boundary cases are tests.
  const today = betaTodayIso()
  const stale = freshnessBand(view.period, today) === "lagging"

  return (
    <div className="grid gap-4 p-6">
      <header className="grid gap-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="font-heading text-xl font-semibold">
            {t("finance.pohledavkyTitle")}
          </h1>
          <div className="flex flex-wrap items-baseline gap-3">
            {view.period && view.batch ? (
              <p className="text-xs text-muted-foreground">
                {t("finance.saldoPeriod")}{" "}
                {formatReportingPeriodLabel(view.period)} ·{" "}
                {t("finance.saldoPublishedAt")}{" "}
                {formatDateTime(view.batch.publishedAt)}
              </p>
            ) : null}
            {scope.role === "owner" ? (
              <EntrySheet
                action={startManualBatchAction}
                idle={START_MANUAL_BATCH_IDLE}
                hidden={{
                  orgSlug,
                  dataset: "saldokonto",
                  periodKind: "month",
                }}
                triggerLabel={t("uzaverka.startSaldokontoTrigger")}
                title={t("uzaverka.startSaldokontoTitle")}
                description={t("uzaverka.startSaldokontoDescription")}
                submitLabel={t("uzaverka.startSaldokontoSubmit")}
              >
                <ManualBatchPeriodFields
                  t={t}
                  idPrefix="start-saldokonto-pohledavky"
                  defaultMonth={Number(today.slice(5, 7))}
                  defaultYear={Number(today.slice(0, 4))}
                />
              </EntrySheet>
            ) : null}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("finance.pohledavkyIntro")}
        </p>
      </header>

      {view.period === null ? (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-base">
              {t("finance.pohledavkyEmptyHeading")}
            </CardTitle>
            <CardDescription>
              {t("finance.pohledavkyEmptyBody")}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          {stale ? (
            <Alert>
              <AlertDescription>{t("finance.saldoStaleBand")}</AlertDescription>
            </Alert>
          ) : null}

          <Card>
            <CardContent className="flex flex-wrap gap-8 pt-6">
              <div className="grid gap-1">
                <span className="text-xs text-muted-foreground">
                  {t("finance.totalReceivable")}
                </span>
                <span className="font-heading text-2xl tabular-nums">
                  {formatAmount(view.totals.receivable)}
                </span>
              </div>
              <div className="grid gap-1">
                <span className="text-xs text-muted-foreground">
                  {t("finance.totalPayable")}
                </span>
                <span className="font-heading text-2xl tabular-nums">
                  {formatAmount(view.totals.payable)}
                </span>
              </div>
            </CardContent>
          </Card>

          {view.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("finance.pohledavkyNoRows")}
            </p>
          ) : (
            <PartnerSaldoTable rows={view.rows} orgSlug={orgSlug} />
          )}
        </>
      )}
    </div>
  )
}
