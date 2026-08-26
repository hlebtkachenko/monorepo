import Link from "next/link"
import { notFound } from "next/navigation"

import { Badge } from "@workspace/ui/components/badge"

import { StatementTable } from "@/app/_components/statement-table"
import { TrialBalanceTable } from "@/app/_components/trial-balance-table"
import { formatDateTime } from "@/i18n/format-values"
import { getBetaTranslations } from "@/i18n/translations-server"
import {
  officeBatchFor,
  statementLinesForBatch,
  trialBalanceLinesForBatch,
} from "@/lib/data/imports"
import { formatReportingPeriodLabel } from "@/lib/format/period-label"
import {
  IMPORT_DATASET_LABEL_KEY,
  IMPORT_SOURCE_LABEL_KEY,
  IMPORT_STATUS_LABEL_KEY,
} from "@/lib/import-labels"
import { requireOwner } from "@/lib/data/scope"

import { PageHeader } from "../../../../../_components/page-header"

import { resolveOrgScope } from "../../../_lib/org-scope"

import { isUuid } from "../../_actions/input"
import {
  discardDraftAction,
  publishBatchAction,
  rollbackDatasetAction,
} from "../../_actions/uzaverka"

import { ConfirmActionForm } from "../_components/confirm-action-form"

/**
 * One batch, with its rows — the preview step of spec §3.2's manual fallback,
 * and the audit view of everything the agent published.
 *
 * IT RENDERS WITH THE CLIENT'S OWN COMPONENTS (`app/_components/`), which is
 * the entire value of the page: the office is looking at exactly what the
 * client will see, in the same columns, with the same formatting, BEFORE the
 * publish that makes it true. A preview drawn by a second implementation would
 * be a preview of something else.
 *
 * IT ALSO OPENS A SUPERSEDED BATCH, deliberately. "What was the client looking
 * at before the correction?" is the question a rollback acts on, and answering
 * it from the batch history is a link away rather than a database query.
 *
 * THE ACTIONS DEPEND ON THE STATE, and each is the only one that makes sense
 * there: a draft can be published or discarded, a published batch can be rolled
 * back, a superseded one can only be read (re-publishing it IS a rollback, and
 * `publishBatch` refuses it by name for exactly that reason).
 *
 * A DRAFT IS OWNER-ONLY AT THE DATA LAYER TOO. `batchForScope` filters drafts
 * out for every other role, so this page's 404 is not the only wall — the
 * layout's `requireOwner` is the first, and the read is the floor under it.
 */
export default async function BatchPreviewPage({
  params,
}: {
  params: Promise<{ orgSlug: string; batchId: string }>
}) {
  const { orgSlug, batchId } = await params
  // A malformed id would reach Postgres as `uuid = 'nope'` and come back as
  // 22P02, i.e. a 500. It is request input; a bad one is an ordinary 404.
  if (!isUuid(batchId)) notFound()

  const [scope, t] = await Promise.all([
    resolveOrgScope(orgSlug),
    getBetaTranslations(),
  ])
  const owner = requireOwner(scope)

  const batch = await officeBatchFor(owner, batchId)
  if (!batch) notFound()

  const [aktiva, pasiva, vzz, trialBalance] = await Promise.all([
    batch.dataset === "rozvaha"
      ? statementLinesForBatch(owner, batch.id, {
          statementKind: "rozvaha_aktiva",
        })
      : Promise.resolve([]),
    batch.dataset === "rozvaha"
      ? statementLinesForBatch(owner, batch.id, {
          statementKind: "rozvaha_pasiva",
        })
      : Promise.resolve([]),
    batch.dataset === "vzz"
      ? statementLinesForBatch(owner, batch.id, { statementKind: "vzz" })
      : Promise.resolve([]),
    batch.dataset === "predvaha"
      ? trialBalanceLinesForBatch(owner, batch.id)
      : Promise.resolve([]),
  ])

  return (
    <div className="grid gap-6 p-6">
      <div className="grid gap-2">
        <Link
          href={`/${orgSlug}/pro-ucetni/uzaverka?obdobi=${batch.period.id}`}
          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          {t("uzaverka.backToMatrix")}
        </Link>
        <PageHeader
          title={
            <>
              {t(IMPORT_DATASET_LABEL_KEY[batch.dataset])} ·{" "}
              {formatReportingPeriodLabel(batch.period)}
            </>
          }
        />
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge
            variant={batch.status === "published" ? "secondary" : "outline"}
          >
            {t(IMPORT_STATUS_LABEL_KEY[batch.status])}
          </Badge>
          <span>
            {t("uzaverka.importedAt")} {formatDateTime(batch.importedAt)} ·{" "}
            {batch.importedByName ?? t(IMPORT_SOURCE_LABEL_KEY[batch.source])}
          </span>
          {batch.publishedAt ? (
            <span>
              · {t("uzaverka.publishedAt")} {formatDateTime(batch.publishedAt)}
            </span>
          ) : null}
          <span>
            · {t("uzaverka.rowCount")} {batch.rowCount}
          </span>
          {batch.filename ? <span>· {batch.filename}</span> : null}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-2">
        {batch.status === "draft" ? (
          <>
            <ConfirmActionForm
              action={publishBatchAction}
              orgSlug={orgSlug}
              fields={{ batchId: batch.id }}
              triggerLabelKey="uzaverka.publishTrigger"
              titleKey="uzaverka.publishTitle"
              descriptionKey="uzaverka.publishDescription"
              confirmLabelKey="uzaverka.publishConfirm"
            />
            <ConfirmActionForm
              action={discardDraftAction}
              orgSlug={orgSlug}
              fields={{ batchId: batch.id }}
              triggerLabelKey="uzaverka.discardTrigger"
              titleKey="uzaverka.discardTitle"
              descriptionKey="uzaverka.discardDescription"
              confirmLabelKey="uzaverka.discardConfirm"
              variant="destructive"
            />
          </>
        ) : null}

        {batch.status === "published" ? (
          <ConfirmActionForm
            action={rollbackDatasetAction}
            orgSlug={orgSlug}
            fields={{ periodId: batch.period.id, dataset: batch.dataset }}
            triggerLabelKey="uzaverka.rollbackTrigger"
            titleKey="uzaverka.rollbackTitle"
            descriptionKey="uzaverka.rollbackDescription"
            confirmLabelKey="uzaverka.rollbackConfirm"
            variant="destructive"
          />
        ) : null}
      </div>

      {batch.dataset === "rozvaha" ? (
        <div className="grid gap-8">
          <StatementTable
            kind="rozvaha_aktiva"
            captionKey="vykazy.captionAktiva"
            lines={aktiva}
          />
          <StatementTable
            kind="rozvaha_pasiva"
            captionKey="vykazy.captionPasiva"
            lines={pasiva}
          />
        </div>
      ) : null}

      {batch.dataset === "vzz" ? (
        <StatementTable kind="vzz" captionKey="vykazy.captionVzz" lines={vzz} />
      ) : null}

      {batch.dataset === "predvaha" ? (
        <TrialBalanceTable lines={trialBalance} />
      ) : null}
    </div>
  )
}
