"use client"

import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { useBetaTranslations } from "@/i18n/translations"
import {
  ACCOUNT_KIND_LABEL_KEY,
  ACCOUNT_MATCH_KIND_LABEL_KEY,
} from "@/lib/account-labels"
import type { AccountBalanceCard } from "@/lib/data/account-balances"
import { formatAmount } from "@/lib/format/money"
import { formatReportingPeriodLabel } from "@/lib/format/period-label"

import { BalanceSparkline } from "./balance-sparkline"

/**
 * One mapped account, as spec §2.4's card: "zůstatek k <period-end>, 12-mo
 * sparkline".
 *
 * THE FIGURE IS THE OFFICE'S OWN STRING. `formatAmount` groups the digits and
 * appends Kč; it adds nothing and rounds nothing, because the value arrived as
 * the `numeric(14,2)` text Postgres returned for a published předvaha row.
 *
 * A CARD WITH NO FIGURE SAYS SO. An account the current předvaha does not carry
 * renders one sentence instead of a number — never "0 Kč", which a reader
 * cannot tell apart from a measured zero (§0.4). It still renders, rather than
 * disappearing, because the office DID map it: an account that vanishes looks
 * like a portal fault, while an account that says "the předvaha does not list
 * it" is a fact the client can take to their účetní.
 *
 * THE TREND NEEDS TWO POINTS. One published period is a dot, and a chart of one
 * dot invites the reader to see a trend in it (Advisor F18 rules out the empty
 * chart for the same reason), so a single-period card says when the trend will
 * appear instead of drawing one.
 */
export function AccountCard({ card }: { card: AccountBalanceCard }) {
  const t = useBetaTranslations()

  const stated = card.series.filter((point) => point.closingBalance !== null)
  const current = card.series.at(-1) ?? null
  const balance = formatAmount(card.closingBalance)

  return (
    <Card>
      <CardHeader className="gap-1">
        <CardTitle className="font-heading text-base">{card.label}</CardTitle>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">
            {t(ACCOUNT_KIND_LABEL_KEY[card.kind])}
          </Badge>
          <span className="font-mono">{card.accountCode}</span>
          {card.matchKind === "prefix" ? (
            <span>
              {t(ACCOUNT_MATCH_KIND_LABEL_KEY.prefix)}
              {card.matchedAccounts > 0
                ? ` · ${card.matchedAccounts} ${t("finance.uctyAccountsCounted")}`
                : ""}
            </span>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="grid gap-3">
        {balance === null ? (
          <p className="text-sm text-muted-foreground">
            {t("finance.uctyNoBalance")}
          </p>
        ) : (
          <div className="grid gap-1">
            <span className="font-heading text-2xl tabular-nums">
              {balance}
            </span>
            {current ? (
              <span className="text-xs text-muted-foreground">
                {t("finance.uctyBalanceAsOf")}{" "}
                {formatReportingPeriodLabel(current.period)}
              </span>
            ) : null}
          </div>
        )}

        {stated.length > 1 ? (
          <div className="grid gap-1">
            <span className="text-xs text-muted-foreground">
              {t("finance.uctyTrendTitle")}
            </span>
            <BalanceSparkline
              series={card.series}
              className="h-8 w-[120px] text-foreground"
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t("finance.uctyTrendSingle")}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
