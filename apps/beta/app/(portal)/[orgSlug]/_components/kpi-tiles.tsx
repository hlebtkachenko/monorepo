"use client"

import Link from "next/link"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import type { BetaMessageKey } from "@/i18n/messages"
import { useBetaTranslations } from "@/i18n/translations"
import { formatBetaDate } from "@/lib/format/date"
import { formatBetaMoney } from "@/lib/format/money"

/**
 * The §2.1 item 3 KPI tiles.
 *
 * "APPEAR ON DATA PRESENCE (never build stage, never zero-value placeholders)"
 * is the whole specification of this component, and it is a rule about ABSENCE:
 * a tile whose feeder has never spoken must not exist on the page, because a
 * tile reading "0 Kč" is indistinguishable from a measured zero and the client
 * has no way to tell which they are looking at. So this component renders a
 * LIST OF TILES THE CALLER BUILT, and the caller (`page.tsx`, over
 * `load-prehled.ts`'s presence questions) decides which ones exist at all. There
 * is no `value ?? 0` anywhere below, and there must never be one.
 *
 * §2.1 names five tiles. TWO HAVE FEEDERS TODAY — otevřené závazky (the §2.4
 * obligations read model) and zůstatková hodnota majetku (§2.7's asset
 * register). The other three do not, and are NOT stubbed here: výsledek
 * hospodaření needs Výkazy (PR 25) to say which VZZ řádek an export calls it,
 * volné prostředky needs `account_balance_map` (PR 26) to say which účet is a
 * bank, and mzdové náklady needs `payroll_summary` (PR 29) to exist. All three
 * appear on the data-presence grid below as datasets nobody has sent yet, which
 * is the true statement; a tile would be a guess.
 *
 * NO SPARKLINES YET, for the same reason. §2.1 asks for one "where history" —
 * history means several published periods of the same dataset, and the two fed
 * tiles have no period history at all (an obligation is a live balance, an asset
 * carries one `depreciation_as_of`). Drawing a flat line through one point is
 * the "empty chart" F18 rules out.
 */

export type KpiTile = {
  key: string
  labelKey: BetaMessageKey
  /** `numeric(14,2)` as a string — formatted here, never computed. */
  value: string
  /** ISO date or instant this figure is stated as of (§0.4). */
  asOf: string | null
  /** One line under the value: an overdue split, a count, a caveat. */
  caption?: string | null
  href: string
}

export function KpiTiles({ tiles }: { tiles: readonly KpiTile[] }) {
  const t = useBetaTranslations()

  if (tiles.length === 0) return null

  return (
    <section className="grid gap-3">
      <h2 className="font-heading text-sm font-semibold">
        {t("prehled.kpiTitle")}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => (
          <Card key={tile.key}>
            <CardHeader>
              <CardTitle className="font-heading text-sm text-muted-foreground">
                <Link
                  href={tile.href}
                  className="underline-offset-2 hover:underline"
                >
                  {t(tile.labelKey)}
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1">
              <p className="text-2xl font-semibold tabular-nums">
                {formatBetaMoney(tile.value)}
              </p>
              {tile.caption ? (
                <p className="text-xs text-muted-foreground">{tile.caption}</p>
              ) : null}
              {tile.asOf !== null ? (
                <p className="text-xs text-muted-foreground">
                  {t("prehled.asOf")} {formatBetaDate(tile.asOf)}
                </p>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
