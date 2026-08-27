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

import { getBetaTranslations } from "@/i18n/translations-server"
import type { OfficeImportBatchRow } from "@/lib/data/projections"
import { formatDateTime } from "@/lib/format/date"
import {
  IMPORT_DATASET_LABEL_KEY,
  IMPORT_SOURCE_LABEL_KEY,
  IMPORT_STATUS_LABEL_KEY,
} from "@/lib/import-labels"

/**
 * Every batch ever imported for one period, newest first, with the
 * supersession chain drawn (spec §3.2: "batch history with diffs").
 *
 * THE CHAIN IS THE POINT. A superseded batch is not clutter — it is the answer
 * to "what was the client looking at before the correction?", which is the
 * question a rollback exists to act on. `supersededByBatchId` names a row in
 * this very list, so the link is a jump within the table rather than a lookup.
 *
 * NO DIFF VIEWER. The spec's word is "diffs"; what is built is the chain plus
 * row counts, and a row-by-row comparison of two rozvahy is a surface of its
 * own (the office already has the two batches side by side through their
 * preview pages). Stated as a deliberate scope line rather than left to look
 * like an oversight.
 *
 * WHO, HONESTLY. An agent-fed batch has no user behind it, so a null name
 * renders as the SOURCE ("z účetního programu") rather than as a blank or a
 * guessed person — see `officeImportBatchRow`.
 */
export async function BatchHistory({
  orgSlug,
  batches,
}: {
  orgSlug: string
  batches: readonly OfficeImportBatchRow[]
}) {
  const t = await getBetaTranslations()

  if (batches.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("uzaverka.historyEmpty")}
      </p>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("uzaverka.columnDataset")}</TableHead>
          <TableHead>{t("uzaverka.columnState")}</TableHead>
          <TableHead>{t("uzaverka.columnImportedAt")}</TableHead>
          <TableHead>{t("uzaverka.columnSource")}</TableHead>
          <TableHead className="text-right">
            {t("uzaverka.columnRowCount")}
          </TableHead>
          <TableHead>{t("uzaverka.columnChain")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {batches.map((batch) => (
          <TableRow key={batch.id}>
            <TableCell>
              <Link
                href={`/${orgSlug}/pro-ucetni/uzaverka/${batch.id}`}
                className="font-medium hover:underline"
              >
                {t(IMPORT_DATASET_LABEL_KEY[batch.dataset])}
              </Link>
            </TableCell>
            <TableCell>
              <Badge
                variant={
                  batch.status === "published"
                    ? "secondary"
                    : batch.status === "draft"
                      ? "outline"
                      : "outline"
                }
              >
                {t(IMPORT_STATUS_LABEL_KEY[batch.status])}
              </Badge>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {formatDateTime(batch.importedAt)} ·{" "}
              {batch.importedByName ?? t(IMPORT_SOURCE_LABEL_KEY[batch.source])}
            </TableCell>
            <TableCell className="text-sm">
              {t(IMPORT_SOURCE_LABEL_KEY[batch.source])}
              {batch.filename ? (
                <span className="block text-xs text-muted-foreground">
                  {batch.filename}
                </span>
              ) : null}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {batch.rowCount}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {batch.supersededByBatchId ? (
                <>
                  {t("uzaverka.supersededByPrefix")}{" "}
                  <Link
                    href={`/${orgSlug}/pro-ucetni/uzaverka/${batch.supersededByBatchId}`}
                    className="font-medium text-primary underline-offset-2 hover:underline"
                  >
                    {t("uzaverka.supersededByLink")}
                  </Link>{" "}
                  · {formatDateTime(batch.supersededAt)}
                </>
              ) : (
                "—"
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
