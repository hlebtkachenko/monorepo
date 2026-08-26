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
import type { DocumentSummary } from "@/lib/data/projections"
import { formatBetaDate } from "@/lib/format/date"

import {
  DOCUMENT_STATUS_BADGE_VARIANT,
  DOCUMENT_STATUS_LABEL_KEY,
  DOCUMENT_TYPE_LABEL_KEY,
} from "../../dokumenty/_components/labels"

/**
 * The compact row shape for Mzdy › Podklady (spec §2.6): the office's own
 * attendance/HR uploads, for the client to confirm what has already come in.
 *
 * DELIBERATELY NOT `DocumentsTable`. Dokumenty's own table carries the row
 * sheet, the sandboxed preview and the office-message field PR 12 built for
 * the FULL client document workflow — Podklady is a much shallower surface
 * (spec's depth map does not even name it), so this renders the same
 * `DocumentSummary` rows Dokumenty already reads with a plain table and a
 * direct file link, and points a reader who wants the full detail at
 * Dokumenty itself rather than re-building that machinery a second time.
 * Labels are imported from Dokumenty's own map, not duplicated: they are the
 * same Czech words for the same enum values regardless of which page renders
 * them (`app/_components/recent-documents.tsx` already reuses the same map
 * for the same reason).
 */
export async function PodkladyDocumentsTable({
  orgSlug,
  documents,
}: {
  orgSlug: string
  documents: readonly DocumentSummary[]
}) {
  const t = await getBetaTranslations()

  if (documents.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("mzdy.podkladyDocumentsEmpty")}
      </p>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("mzdy.podkladyColumnFile")}</TableHead>
          <TableHead>{t("mzdy.podkladyColumnType")}</TableHead>
          <TableHead>{t("mzdy.podkladyColumnUploaded")}</TableHead>
          <TableHead>{t("mzdy.podkladyColumnStatus")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {documents.map((doc) => (
          <TableRow key={doc.id}>
            <TableCell className="font-medium">
              <Link
                href={`/api/orgs/${orgSlug}/documents/${doc.id}/file`}
                className="text-primary underline-offset-2 hover:underline"
              >
                {doc.filename}
              </Link>
            </TableCell>
            <TableCell>{t(DOCUMENT_TYPE_LABEL_KEY[doc.docType])}</TableCell>
            <TableCell>{formatBetaDate(doc.uploadedAt)}</TableCell>
            <TableCell>
              <Badge variant={DOCUMENT_STATUS_BADGE_VARIANT[doc.status]}>
                {t(DOCUMENT_STATUS_LABEL_KEY[doc.status])}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
