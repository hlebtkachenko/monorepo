"use client"

import { Badge } from "@workspace/ui/components/badge"

import type { BetaImportDataset } from "@/db/schema"
import type { BetaMessageKey } from "@/i18n/messages"
import { useBetaTranslations } from "@/i18n/translations"
import type { DatasetFreshness } from "@/lib/data/imports"
import { formatBetaDate } from "@/lib/format/date"
import { formatReportingPeriodLabel } from "@/lib/format/period-label"
import { freshnessBand } from "@/lib/freshness"

/**
 * "Vaše data" — per-dataset presence and freshness (spec §0.4, Advisor F24:
 * "freshness per DATASET + completeness matrix + warning bands").
 *
 * WHY A PRESENCE GRID EXISTS NEXT TO THE KPI TILES, when the tiles already
 * appear only where there is data. Because the tiles' silence is ambiguous.
 * §2.1 forbids a tile without a value, so a client whose office has not sent
 * anything sees five fewer tiles and no explanation — which reads as a broken
 * page, or worse, as a page saying everything is fine. This grid is the other
 * half of §0.4's honesty: it names every dataset the product has, and says of
 * each one whether it exists, when it was last delivered, and for which period.
 *
 * THREE STATES PER DATASET, AND THEY ARE DIFFERENT FACTS:
 *
 *   not connected — the dataset has no payload table in this build yet
 *                   (`IMPORT_DATASETS`' `implemented: false`). Nobody could
 *                   have sent it.
 *   not uploaded  — connected, and the office has published nothing.
 *   published     — with its period and its publication date. Two or more
 *                   periods behind today, it additionally carries §0.4's
 *                   warning band, in §0.4's own words.
 *
 * The three are never collapsed into "no data", because the office's next
 * action differs in each case and a client asking about it needs to be pointed
 * at the right one.
 *
 * DOKUMENTY IS ON THE GRID BUT IS NOT AN IMPORT DATASET. It is fed continuously
 * by the client rather than published per period (§2.2), so it has a count and
 * an upload stamp and NO period — and therefore no lag band, because "behind by
 * a period" is not a thing a continuous feed can be. Its row states what it
 * genuinely knows and nothing more.
 */

const DATASET_LABEL_KEY = {
  predvaha: "prehled.datasetPredvaha",
  rozvaha: "prehled.datasetRozvaha",
  vzz: "prehled.datasetVzz",
  saldokonto: "prehled.datasetSaldokonto",
  payroll: "prehled.datasetPayroll",
} as const satisfies Record<BetaImportDataset, BetaMessageKey>

export type DocumentPresence = {
  total: number
  newestUploadedAt: string | null
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border-subtle pb-2 last:border-0 last:pb-0">
      <span className="text-sm font-medium">{label}</span>
      <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {children}
      </span>
    </li>
  )
}

export function DataPresence({
  datasets,
  documents,
  today,
}: {
  datasets: readonly DatasetFreshness[]
  documents: DocumentPresence
  /** Prague-local `YYYY-MM-DD` — passed in, never read off the clock here, so
   * every band on the page is judged against the same day. */
  today: string
}) {
  const t = useBetaTranslations()

  return (
    <section className="grid gap-2">
      <h2 className="mt-0 font-sans text-sm font-semibold">
        {t("prehled.dataTitle")}
      </h2>
      <p className="text-xs text-muted-foreground">{t("prehled.dataHint")}</p>
      <ul className="grid gap-2">
        {datasets.map((dataset) => {
          const band = freshnessBand(dataset.period, today)

          return (
            <Row
              key={dataset.dataset}
              label={t(DATASET_LABEL_KEY[dataset.dataset])}
            >
              {!dataset.implemented ? (
                <Badge variant="outline">{t("prehled.dataNotConnected")}</Badge>
              ) : dataset.period === null ? (
                <span>{t("prehled.dataNotUploaded")}</span>
              ) : (
                <>
                  <span className="tabular-nums">
                    {formatReportingPeriodLabel(dataset.period)}
                  </span>
                  {dataset.publishedAt !== null ? (
                    <span className="tabular-nums">
                      · {t("prehled.dataUploadedOn")}{" "}
                      {formatBetaDate(dataset.publishedAt)}
                    </span>
                  ) : null}
                  {band === "lagging" ? (
                    <>
                      <Badge variant="destructive">
                        {t("prehled.dataStaleBadge")}
                      </Badge>
                      <span className="text-destructive">
                        {t("prehled.dataStalePrefix")}{" "}
                        {formatBetaDate(dataset.period.endsOn)}{" "}
                        {t("prehled.dataStaleSuffix")}
                      </span>
                    </>
                  ) : null}
                </>
              )}
            </Row>
          )
        })}

        <Row label={t("prehled.datasetDokumenty")}>
          {documents.newestUploadedAt === null ? (
            <span>{t("prehled.dataNotUploaded")}</span>
          ) : (
            <span className="tabular-nums">
              {documents.total} {t("prehled.dataDocumentsCount")} ·{" "}
              {t("prehled.dataDocumentsLast")}{" "}
              {formatBetaDate(documents.newestUploadedAt)}
            </span>
          )}
        </Row>
      </ul>
    </section>
  )
}
