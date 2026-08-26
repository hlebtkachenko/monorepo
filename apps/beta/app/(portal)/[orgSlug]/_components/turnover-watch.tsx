"use client"

import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import type { BetaMessageKey } from "@/i18n/messages"
import { useBetaTranslations } from "@/i18n/translations"
import { formatBetaDate } from "@/lib/format/date"
import { formatBetaMoney } from "@/lib/format/money"
import {
  TURNOVER_PAYER_BY_LAW_THRESHOLD,
  TURNOVER_REGISTRATION_THRESHOLD,
  TURNOVER_SOURCES,
  turnoverTier,
  type TurnoverReading,
  type TurnoverSource,
  type TurnoverTier,
} from "@/lib/turnover"

/**
 * "Obrat watch" (spec §2.1 item 4) — the two-tier DPH registration thresholds,
 * and where this company stands against them.
 *
 * NEPLÁTCE ONLY. §5 is explicit ("VAT gates: ... obrat-watch neplátce only"),
 * and the reason is not tidiness: a plátce has already crossed the thresholds
 * and a card telling them about a registration duty they discharged years ago
 * is noise at best and alarming at worst. The gate is this component returning
 * `null`, so a plátce's page has no empty section either.
 *
 * THE FIGURE IS OFFICE-PROVIDED OR IT IS ABSENT. Obrat for DPH purposes is 12
 * consecutive months of taxable supplies with place of plnění in tuzemsko — not
 * a line of any statement in this database and not derivable from one. §0.2
 * forbids the portal deriving an accounting fact, and this is the fact where a
 * derived approximation would do the most damage, because it decides whether a
 * company must register. So with no reading the card renders the thresholds and
 * says plainly that the number has not been supplied, naming both feeds §2.1
 * lists and marking them unconnected — the same device `SourceFreshness` uses on
 * Dluhy a platby, and the reason `TURNOVER_SOURCES` exists at all.
 *
 * WITH a reading it prints exactly what the office stated, its as-of date, and
 * which of the two thresholds it has passed — `turnoverTier`, which compares in
 * exact minor units and never parses money into a float.
 */

const TIER_LABEL_KEY = {
  below: "prehled.obratTierBelow",
  registration_duty: "prehled.obratTierRegistration",
  payer_by_law: "prehled.obratTierPayer",
} as const satisfies Record<TurnoverTier, BetaMessageKey>

const TIER_VARIANT = {
  below: "secondary",
  registration_duty: "default",
  payer_by_law: "destructive",
} as const satisfies Record<
  TurnoverTier,
  "secondary" | "default" | "destructive"
>

const SOURCE_LABEL_KEY = {
  indicator: "prehled.obratSourceIndicator",
  vzz_import: "prehled.obratSourceVzz",
} as const satisfies Record<TurnoverSource, BetaMessageKey>

export function TurnoverWatch({
  vatRegime,
  reading,
}: {
  vatRegime: "platce" | "neplatce"
  reading: TurnoverReading | null
}) {
  const t = useBetaTranslations()

  if (vatRegime !== "neplatce") return null

  const tier = reading === null ? null : turnoverTier(reading.amount)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-lg">
          {t("prehled.obratTitle")}
        </CardTitle>
        <CardDescription>{t("prehled.obratHint")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {reading !== null && tier !== null ? (
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="font-heading text-2xl tabular-nums">
              {formatBetaMoney(reading.amount)}
            </span>
            <Badge variant={TIER_VARIANT[tier]}>
              {t(TIER_LABEL_KEY[tier])}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {t("prehled.asOf")} {formatBetaDate(reading.asOf)} ·{" "}
              {t(SOURCE_LABEL_KEY[reading.source])}
            </span>
          </div>
        ) : (
          <div className="grid gap-1">
            <p className="text-sm font-medium">{t("prehled.obratAbsent")}</p>
            <p className="text-sm text-muted-foreground">
              {t("prehled.obratAbsentHint")}
            </p>
            <ul className="flex flex-wrap gap-2 pt-1">
              {TURNOVER_SOURCES.map((source) => (
                <li key={source.source} className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">
                    {t(SOURCE_LABEL_KEY[source.source])}
                  </span>
                  {source.implemented ? null : (
                    <Badge variant="outline">
                      {t("prehled.dataNotConnected")}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <dl className="grid gap-1 text-xs text-muted-foreground">
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-medium tabular-nums">
              {formatBetaMoney(TURNOVER_REGISTRATION_THRESHOLD)}
            </dt>
            <dd>— {t("prehled.obratThresholdRegistration")}</dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-medium tabular-nums">
              {formatBetaMoney(TURNOVER_PAYER_BY_LAW_THRESHOLD)}
            </dt>
            <dd>— {t("prehled.obratThresholdPayer")}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  )
}
