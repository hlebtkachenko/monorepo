import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { getBetaTranslations } from "@/i18n/translations-server"
import { filingsForScope, filingYtdPaidByFamily } from "@/lib/data/filings"
import { obligationsForScope } from "@/lib/data/obligations"
import { FILING_FAMILY_LABEL_KEY } from "@/lib/filing-labels"
import { currentBetaYear, formatBetaDate } from "@/lib/format/date"
import { formatBetaMoney } from "@/lib/format/money"

import { FilingTable } from "@/app/_components/filing-table"

import { resolveOrgScope } from "../_lib/org-scope"

import { resolveVisibleFilingFamilies } from "./_lib/dane-scope"

/**
 * Souhrn (spec §2.3, §depth: "DEEP — answers 'jsme v pořádku s úřady'"): the
 * cross-family rollup over the one filing registry.
 *
 * FOUR READS, ZERO ARITHMETIC ABOVE THE DATABASE (spec §0.2):
 *   - `filingsForScope` — the full registry, for the upcoming strip and the
 *     current-year timeline. Both are ROW SELECTION (filter + slice), not
 *     money math, so it happens here rather than in a new SQL query.
 *   - `obligationsForScope` — reused whole for its "Neuhrazeno" totals (SQL
 *     window-function sums) AND its `filing` source's freshness stamp,
 *     rather than this page computing either itself.
 *   - `filingYtdPaidByFamily` — the one genuinely new read this page needs
 *     (spec §2.3 "YTD paid per family"), SQL-summed.
 *   - `resolveVisibleFilingFamilies` — the §2.3 DPH gate, applied to the
 *     YTD-per-family list so a neplátce with no history never sees a "0 Kč
 *     DPH" row implying an obligation that does not exist.
 */
export default async function DaneSouhrnPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params

  const [scope, t, visibleFamilies] = await Promise.all([
    resolveOrgScope(orgSlug),
    getBetaTranslations(),
    resolveVisibleFilingFamilies(orgSlug),
  ])

  const [filings, obligations, ytdByFamily] = await Promise.all([
    filingsForScope(scope),
    obligationsForScope(scope),
    filingYtdPaidByFamily(scope),
  ])

  const filingFreshness = obligations.freshness.find(
    (source) => source.source === "filing",
  )

  // Not yet filed, earliest deadline first — `filingsForScope` already
  // orders by `due_on`, so this is a filter and a slice, nothing more.
  const upcoming = filings
    .filter((filing) => filing.filedOn === null)
    .slice(0, 5)

  const year = currentBetaYear()
  // `dueOn` is a plain `YYYY-MM-DD` string; comparing its first four
  // characters is a row filter, not date arithmetic.
  const timeline = filings.filter(
    (filing) => filing.dueOn.slice(0, 4) === String(year),
  )

  const ytdVisible = ytdByFamily.filter((row) =>
    visibleFamilies.includes(row.family),
  )

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-sm text-muted-foreground">
              {t("dane.souhrnUnpaidTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1">
            <p className="text-2xl font-semibold tabular-nums">
              {formatBetaMoney(obligations.totals.total)}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatBetaMoney(obligations.totals.overdue)}{" "}
              {t("dane.souhrnUnpaidOverdue")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-sm text-muted-foreground">
              {t("dane.souhrnFreshnessTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {filingFreshness?.sourceUpdatedAt
                ? formatBetaDate(filingFreshness.sourceUpdatedAt)
                : t("dane.souhrnFreshnessEmpty")}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">
            {t("dane.souhrnUpcomingTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FilingTable
            orgSlug={orgSlug}
            filings={upcoming}
            showFamily
            emptyMessageKey="dane.souhrnUpcomingEmpty"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">
            {t("dane.souhrnYtdTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ytdVisible.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("dane.souhrnYtdEmpty")}
            </p>
          ) : (
            <dl className="grid gap-3 sm:grid-cols-2">
              {ytdVisible.map((row) => (
                <div
                  key={row.family}
                  className="flex items-center justify-between rounded-md border border-border-subtle p-3"
                >
                  <dt className="text-sm text-muted-foreground">
                    {t(FILING_FAMILY_LABEL_KEY[row.family])}
                  </dt>
                  <dd className="text-sm font-medium tabular-nums">
                    {formatBetaMoney(row.paidTotal)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">
            {t("dane.souhrnTimelineTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FilingTable
            orgSlug={orgSlug}
            filings={timeline}
            showFamily
            emptyMessageKey="dane.souhrnTimelineEmpty"
          />
        </CardContent>
      </Card>
    </>
  )
}
