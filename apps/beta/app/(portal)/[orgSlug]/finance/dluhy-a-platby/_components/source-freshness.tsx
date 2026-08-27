"use client"

import { Badge } from "@workspace/ui/components/badge"

import type { BetaMessageKey } from "@/i18n/messages"
import { useBetaTranslations } from "@/i18n/translations"
import type {
  ObligationSource,
  ObligationSourceFreshness,
} from "@/lib/data/obligations"
import { formatDateTime } from "@/lib/format/date"

/**
 * Where the numbers on this page came from, and when each source was last fed
 * (spec §0.4: "Freshness honesty — per dataset", §2.4: "Per-group stamp = the
 * SOURCE's own stamp").
 *
 * THIS IS WHY THE READ MODEL RETURNS UNIMPLEMENTED SOURCES AT ALL. Dluhy a
 * platby is a union of three feeds and one of them (the imported saldokonto,
 * PR 28) does not exist yet. Rendering the page without saying so would let a
 * client read the total as everything they owe, when the supplier side is simply
 * not connected — a confidently wrong number, which §0.4 exists to prevent. So
 * an absent source says "zatím nenapojeno" rather than "0 Kč", and a
 * connected-but-empty one says when it was last touched.
 */
const SOURCE_LABEL_KEY = {
  filing: "finance.sourceFiling",
  partner_saldo: "finance.sourcePartnerSaldo",
  manual_liability: "finance.sourceManualLiability",
} as const satisfies Record<ObligationSource, BetaMessageKey>

export function SourceFreshness({
  freshness,
}: {
  freshness: readonly ObligationSourceFreshness[]
}) {
  const t = useBetaTranslations()

  return (
    <section className="grid gap-2">
      <h2 className="font-heading text-sm font-semibold">
        {t("finance.sourcesTitle")}
      </h2>
      <p className="text-xs text-muted-foreground">
        {t("finance.sourcesHint")}
      </p>
      <ul className="grid gap-1">
        {freshness.map((source) => (
          <li
            key={source.source}
            className="flex flex-wrap items-center gap-2 text-sm"
          >
            <span className="font-medium">
              {t(SOURCE_LABEL_KEY[source.source])}
            </span>
            {!source.implemented ? (
              <Badge variant="outline">{t("finance.sourceNotConnected")}</Badge>
            ) : source.sourceUpdatedAt === null ? (
              <span className="text-muted-foreground">
                {t("finance.sourceNoData")}
              </span>
            ) : (
              <span className="text-muted-foreground">
                {t("finance.asOf")} {formatDateTime(source.sourceUpdatedAt)} ·{" "}
                {source.openCount} {t("finance.sourceOpenCount")}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
