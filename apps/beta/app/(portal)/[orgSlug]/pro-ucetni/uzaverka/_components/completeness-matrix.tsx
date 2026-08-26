import Link from "next/link"

import { Badge } from "@workspace/ui/components/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { formatDateTime } from "@/i18n/format-values"
import { getBetaTranslations } from "@/i18n/translations-server"
import {
  IMPORT_DATASET_LABEL_KEY,
  IMPORT_SOURCE_LABEL_KEY,
} from "@/lib/import-labels"

import {
  publishBatchAction,
  rollbackDatasetAction,
} from "../../_actions/uzaverka"
import type { DatasetCell } from "../_lib/load-uzaverka"

import { ConfirmActionForm } from "./confirm-action-form"

/**
 * The completeness matrix (spec §3.2 / §0.4): one row per dataset, for one
 * period, saying honestly which of four states it is in.
 *
 *   ZATÍM NENAPOJENO — the dataset has no payload table in this build. Not a
 *     gap in the office's work, and it must not read as one (PR 18's Dluhy a
 *     platby set this precedent for its own unimplemented source).
 *   PUBLIKOVÁNO      — a live batch. This is what the client is looking at, so
 *     the row carries its as-of stamp, its source and who published it.
 *   ROZPRACOVÁNO     — a draft is staged and no client can see it. The action
 *     is "publish", and the link goes to the rows first.
 *   ZATÍM NENAHRÁNO  — implemented, nothing sent for this period. The gap the
 *     office is meant to see before the client does.
 *
 * PUBLISHED AND DRAFT ARE NOT EXCLUSIVE, and the row shows both when both
 * exist: a correction staged over a live batch is the ordinary month-end
 * shape, and a matrix that hid the draft behind the publication would make the
 * office think the correction was lost.
 */
export async function CompletenessMatrix({
  orgSlug,
  periodId,
  cells,
}: {
  orgSlug: string
  periodId: string
  cells: readonly DatasetCell[]
}) {
  const t = await getBetaTranslations()

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("uzaverka.columnDataset")}</TableHead>
          <TableHead>{t("uzaverka.columnState")}</TableHead>
          <TableHead>{t("uzaverka.columnPublishedAt")}</TableHead>
          <TableHead>{t("uzaverka.columnSource")}</TableHead>
          <TableHead className="text-right">
            {t("uzaverka.columnRowCount")}
          </TableHead>
          <TableHead>{t("uzaverka.columnActions")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {cells.map((cell) => (
          <TableRow key={cell.dataset}>
            <TableCell className="font-medium">
              {t(IMPORT_DATASET_LABEL_KEY[cell.dataset])}
            </TableCell>

            <TableCell className="space-x-1">
              {!cell.implemented ? (
                <Badge variant="outline">{t("uzaverka.stateNotWired")}</Badge>
              ) : (
                <>
                  {cell.published ? (
                    <Badge variant="secondary">
                      {t("uzaverka.statePublished")}
                    </Badge>
                  ) : null}
                  {cell.draft ? (
                    <Badge variant="outline">{t("uzaverka.stateDraft")}</Badge>
                  ) : null}
                  {!cell.published && !cell.draft ? (
                    <span className="text-sm text-muted-foreground">
                      {t("uzaverka.stateMissing")}
                    </span>
                  ) : null}
                </>
              )}
            </TableCell>

            <TableCell className="text-sm text-muted-foreground">
              {cell.published
                ? `${formatDateTime(cell.published.publishedAt)} · ${
                    cell.published.publishedByName ??
                    t(IMPORT_SOURCE_LABEL_KEY[cell.published.source])
                  }`
                : "—"}
            </TableCell>

            <TableCell className="text-sm">
              {cell.published ? (
                <>
                  {t(IMPORT_SOURCE_LABEL_KEY[cell.published.source])}
                  {cell.published.filename ? (
                    <span className="block text-xs text-muted-foreground">
                      {cell.published.filename}
                    </span>
                  ) : null}
                </>
              ) : (
                "—"
              )}
            </TableCell>

            <TableCell className="text-right tabular-nums">
              {cell.published ? cell.published.rowCount : "—"}
            </TableCell>

            <TableCell>
              <div className="flex flex-wrap items-start gap-2">
                {cell.draft ? (
                  <Link
                    href={`/${orgSlug}/pro-ucetni/uzaverka/${cell.draft.id}`}
                    className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                  >
                    {t("uzaverka.openDraft")}
                  </Link>
                ) : null}

                {cell.draft ? (
                  <ConfirmActionForm
                    action={publishBatchAction}
                    orgSlug={orgSlug}
                    fields={{ batchId: cell.draft.id }}
                    triggerLabelKey="uzaverka.publishTrigger"
                    titleKey="uzaverka.publishTitle"
                    descriptionKey={
                      cell.published
                        ? "uzaverka.publishOverDescription"
                        : "uzaverka.publishDescription"
                    }
                    confirmLabelKey="uzaverka.publishConfirm"
                  />
                ) : null}

                {cell.published ? (
                  <ConfirmActionForm
                    action={rollbackDatasetAction}
                    orgSlug={orgSlug}
                    fields={{ periodId, dataset: cell.dataset }}
                    triggerLabelKey="uzaverka.rollbackTrigger"
                    titleKey="uzaverka.rollbackTitle"
                    descriptionKey="uzaverka.rollbackDescription"
                    confirmLabelKey="uzaverka.rollbackConfirm"
                    variant="destructive"
                  />
                ) : null}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
