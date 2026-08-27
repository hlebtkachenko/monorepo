import Link from "next/link"

import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { getBetaTranslations } from "@/i18n/translations-server"
import { accountBalancesForScope } from "@/lib/data/account-balances"
import { formatDateTime } from "@/lib/format/date"
import { formatAmount } from "@/lib/format/money"
import { formatReportingPeriodLabel } from "@/lib/format/period-label"
import { freshnessBand } from "@/lib/freshness"

import { PageHeader } from "../../../../_components/page-header"

import { resolveOrgScope } from "../../_lib/org-scope"

import { AccountCard } from "./_components/account-card"

/**
 * Finance › Účty a hotovost (spec §2.4) — bank and cash balances off the
 * published obratová předvaha.
 *
 * READ-ONLY FOR EVERY ROLE, guest included (§5). There is no write on this page
 * and no "Upravit" control either: §3.3 puts the curation of the account map in
 * Pro účetní › Zadávání dat, and the one affordance below that points there is
 * shown to the OWNER ONLY — for anybody else it would be a link into a 404.
 *
 * NOTHING IS COMPUTED HERE. Every balance is a `closing_balance` the office
 * published; the total is a SQL SUM over exactly the cards being rendered
 * (`accountBalancesForScope`); the sparkline's geometry is a set of 0..1
 * coordinates Postgres produced. This page picks Czech words and a layout.
 *
 * THREE HONEST EMPTY STATES (§0.4), and they say different things because they
 * ARE different things:
 *
 *   nothing published    "zatím nebylo nahráno" — the předvaha has not arrived,
 *                        so there is no figure to show and none is invented.
 *   nothing mapped       the předvaha is here but nobody has said which účet is
 *                        a bank. The client is told that, and the owner is told
 *                        where to fix it.
 *   published but stale  §0.4's warning band, over whatever IS shown: the
 *                        numbers are real, they are simply not the newest
 *                        period the calendar has reached.
 */
export default async function UctyAHotovostPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const scope = await resolveOrgScope(orgSlug)

  const [t, model] = await Promise.all([
    getBetaTranslations(),
    accountBalancesForScope(scope),
  ])

  // `toISOString().slice(0, 10)` rather than a locale date: `freshnessBand`
  // compares period coordinates and only reads the year and month out of this
  // string, which is why it takes one instead of calling `new Date()` itself.
  const today = new Date().toISOString().slice(0, 10)
  const band = freshnessBand(model.period, today)
  const total = formatAmount(model.total)

  return (
    <div className="grid gap-4 p-6">
      <PageHeader
        title={t("finance.uctyTitle")}
        intro={t("finance.uctyIntro")}
      />

      {model.period === null ? (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-base">
              {t("finance.uctyEmptyHeading")}
            </CardTitle>
            <CardDescription>{t("finance.uctyEmptyBody")}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          {band === "lagging" ? (
            <Alert>
              <AlertDescription>
                {t("finance.uctyStaleBandPrefix")}{" "}
                {formatReportingPeriodLabel(model.period)}
                {t("finance.uctyStaleBandSuffix")}
              </AlertDescription>
            </Alert>
          ) : null}

          {model.cards.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-base">
                  {t("finance.uctyUnmappedHeading")}
                </CardTitle>
                <CardDescription>
                  {t("finance.uctyUnmappedBody")}
                </CardDescription>
              </CardHeader>
              {scope.role === "owner" ? (
                <CardContent>
                  <Link
                    href={`/${orgSlug}/pro-ucetni/zadavani`}
                    className="text-sm font-medium underline underline-offset-4"
                  >
                    {t("finance.uctyUnmappedOwnerCta")}
                  </Link>
                </CardContent>
              ) : null}
            </Card>
          ) : (
            <>
              <Card>
                <CardContent className="flex flex-wrap items-end gap-8 pt-6">
                  <div className="grid gap-1">
                    <span className="text-xs text-muted-foreground">
                      {t("finance.uctyTotal")}
                    </span>
                    <span className="font-heading text-2xl tabular-nums">
                      {/* Null is an absence, not a zero (§0.4): not one mapped
                          account states a balance for this period. */}
                      {total ?? t("finance.uctyNoBalance")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t("finance.uctyTotalHint")}
                    </span>
                  </div>
                  <div className="grid gap-1 text-xs text-muted-foreground">
                    <span>
                      {t("finance.uctyBalanceAsOf")}{" "}
                      {formatReportingPeriodLabel(model.period)}
                    </span>
                    {model.publishedAt !== null ? (
                      <span>
                        {t("finance.uctyPublishedAt")}{" "}
                        {formatDateTime(model.publishedAt)}
                      </span>
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {model.cards.map((card) => (
                  <AccountCard key={card.id} card={card} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
