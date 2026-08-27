import Link from "next/link"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { getBetaTranslations } from "@/i18n/translations-server"
import { requireOwner } from "@/lib/data/scope"
import { formatReportingPeriodLabel } from "@/lib/format/period-label"

import { PageHeader, SectionTitle } from "../../../../_components/page-header"

import { EntrySheet } from "../../_components/entry-sheet"
import { ManualBatchPeriodFields } from "../../_components/manual-batch-period-fields"
import { resolveOrgScope } from "../../_lib/org-scope"

import {
  startManualBatchAction,
  uploadCsvBatchAction,
} from "../_actions/uzaverka"
import { START_MANUAL_BATCH_IDLE } from "../_actions/uzaverka-state"

import { BatchHistory } from "./_components/batch-history"
import { CompletenessMatrix } from "./_components/completeness-matrix"
import { CsvUploadForm } from "./_components/csv-upload-form"
import { loadUzaverka } from "./_lib/load-uzaverka"

/** The query-string key the period selector writes. */
const PERIOD_PARAM = "obdobi"

/**
 * Pro účetní › Měsíční uzávěrka — the review surface (spec §3.2, as amended:
 * "the Pro účetní UI becomes the REVIEW surface: completeness matrix, batch
 * history, publish/rollback buttons, and a manual file-drop fallback").
 *
 * THE FEEDING CHANNEL IS THE AGENT, NOT THIS PAGE. Everything here reviews
 * what the office's own agent published through the ingestion API; the CSV form
 * at the bottom is the fallback for the month that channel is down. The order
 * on screen says so — what is in, then what happened, then how to fix it by
 * hand.
 *
 * PERIOD-AT-A-TIME, because that is the unit of the ritual: the office closes
 * 07/2026, and the question is whether all five datasets are in for 07/2026.
 * The selector lists every period the organization knows about (a filing
 * creates one), not only those with imports, so the office can open the month
 * it is about to feed.
 *
 * OWNER-ONLY BY THE LAYOUT ABOVE (`pro-ucetni/layout.tsx`), and independently
 * by every action's own `requireOwner` — the layout stops a browser from
 * SEEING this page; it does not run for a Server Action POST.
 */
export default async function UzaverkaPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ obdobi?: string }>
}) {
  const { orgSlug } = await params
  const requested = (await searchParams)[PERIOD_PARAM]

  const [scope, t] = await Promise.all([
    resolveOrgScope(orgSlug),
    getBetaTranslations(),
  ])
  const owner = requireOwner(scope)
  const view = await loadUzaverka(owner, requested)

  const now = new Date()
  const allBatches = view.cells.flatMap((cell) => cell.batches)

  return (
    <div className="grid gap-6 p-6">
      <PageHeader
        title={t("uzaverka.title")}
        intro={t("uzaverka.intro")}
        actions={
          <div className="flex flex-wrap gap-2">
            <EntrySheet
              action={startManualBatchAction}
              idle={START_MANUAL_BATCH_IDLE}
              hidden={{ orgSlug, dataset: "saldokonto", periodKind: "month" }}
              triggerLabel={t("uzaverka.startSaldokontoTrigger")}
              triggerVariant="default"
              title={t("uzaverka.startSaldokontoTitle")}
              description={t("uzaverka.startSaldokontoDescription")}
              submitLabel={t("uzaverka.startSaldokontoSubmit")}
            >
              <ManualBatchPeriodFields
                t={t}
                idPrefix="start-saldokonto-uzaverka"
                defaultMonth={view.period?.month ?? now.getMonth() + 1}
                defaultYear={view.period?.year ?? now.getFullYear()}
              />
            </EntrySheet>
            {/*
              rozvaha / vzz / predvaha (manual-entry plan §3, W5) —
              `startManualBatchAction` is already generic over all four
              datasets (W1); this is the wave that wires the last three
              triggers. Row entry happens on the batch preview these redirect
              to (`StatementBatchTable` / `TrialBalanceBatchTable`).
            */}
            <EntrySheet
              action={startManualBatchAction}
              idle={START_MANUAL_BATCH_IDLE}
              hidden={{ orgSlug, dataset: "rozvaha", periodKind: "month" }}
              triggerLabel={t("vykazyZadani.startRozvahaTrigger")}
              title={t("vykazyZadani.startRozvahaTitle")}
              description={t("vykazyZadani.startRozvahaDescription")}
              submitLabel={t("vykazyZadani.startRozvahaSubmit")}
            >
              <ManualBatchPeriodFields
                t={t}
                idPrefix="start-rozvaha-uzaverka"
                defaultMonth={view.period?.month ?? now.getMonth() + 1}
                defaultYear={view.period?.year ?? now.getFullYear()}
              />
            </EntrySheet>
            <EntrySheet
              action={startManualBatchAction}
              idle={START_MANUAL_BATCH_IDLE}
              hidden={{ orgSlug, dataset: "vzz", periodKind: "month" }}
              triggerLabel={t("vykazyZadani.startVzzTrigger")}
              title={t("vykazyZadani.startVzzTitle")}
              description={t("vykazyZadani.startVzzDescription")}
              submitLabel={t("vykazyZadani.startVzzSubmit")}
            >
              <ManualBatchPeriodFields
                t={t}
                idPrefix="start-vzz-uzaverka"
                defaultMonth={view.period?.month ?? now.getMonth() + 1}
                defaultYear={view.period?.year ?? now.getFullYear()}
              />
            </EntrySheet>
            <EntrySheet
              action={startManualBatchAction}
              idle={START_MANUAL_BATCH_IDLE}
              hidden={{ orgSlug, dataset: "predvaha", periodKind: "month" }}
              triggerLabel={t("vykazyZadani.startPredvahaTrigger")}
              title={t("vykazyZadani.startPredvahaTitle")}
              description={t("vykazyZadani.startPredvahaDescription")}
              submitLabel={t("vykazyZadani.startPredvahaSubmit")}
            >
              <ManualBatchPeriodFields
                t={t}
                idPrefix="start-predvaha-uzaverka"
                defaultMonth={view.period?.month ?? now.getMonth() + 1}
                defaultYear={view.period?.year ?? now.getFullYear()}
              />
            </EntrySheet>
          </div>
        }
      />

      {view.periods.length > 0 ? (
        <nav
          aria-label={t("uzaverka.periodPickerLabel")}
          className="flex flex-wrap items-center gap-2"
        >
          <span className="text-sm text-muted-foreground">
            {t("uzaverka.periodPickerLabel")}
          </span>
          {view.periods.map((option) => (
            <Link
              key={option.id}
              href={`/${orgSlug}/pro-ucetni/uzaverka?${PERIOD_PARAM}=${option.id}`}
              scroll={false}
            >
              <Button
                variant={
                  option.id === view.period?.id ? "secondary" : "outline"
                }
                size="sm"
              >
                {formatReportingPeriodLabel(option)}
              </Button>
            </Link>
          ))}
        </nav>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("uzaverka.noPeriodsYet")}
        </p>
      )}

      {view.period ? (
        <>
          <section className="grid gap-3">
            <SectionTitle>
              {t("uzaverka.matrixTitle")}{" "}
              {formatReportingPeriodLabel(view.period)}
            </SectionTitle>
            <CompletenessMatrix
              orgSlug={orgSlug}
              periodId={view.period.id}
              cells={view.cells}
            />
          </section>

          <section className="grid gap-3">
            <SectionTitle>{t("uzaverka.historyTitle")}</SectionTitle>
            <BatchHistory orgSlug={orgSlug} batches={allBatches} />
          </section>
        </>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base">
            {t("uzaverka.uploadTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            {t("uzaverka.uploadIntro")}
          </p>
          <CsvUploadForm
            action={uploadCsvBatchAction}
            orgSlug={orgSlug}
            // The period under review when there is one, so the common case
            // (feed the month you are looking at) is prefilled; otherwise the
            // current month, which is what an office with an empty book means.
            defaultYear={view.period?.year ?? now.getFullYear()}
            defaultMonth={view.period?.month ?? now.getMonth() + 1}
          />
        </CardContent>
      </Card>
    </div>
  )
}
