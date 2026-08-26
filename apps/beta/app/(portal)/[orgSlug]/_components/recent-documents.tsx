"use client"

import Link from "next/link"

import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { useBetaTranslations } from "@/i18n/translations"
import type { DocumentSummary } from "@/lib/data/projections"
import { formatBetaDate } from "@/lib/format/date"

import {
  DOCUMENT_STATUS_BADGE_VARIANT,
  DOCUMENT_STATUS_LABEL_KEY,
} from "../dokumenty/_components/labels"

/**
 * "Poslední dokumenty" (spec §2.1 item 6): "5 rows, status chips".
 *
 * THE CHIPS ARE IMPORTED FROM DOKUMENTY, not re-declared. `Vráceno` is the one
 * status that means the office needs something back from the client (§2.2, and
 * `DOCUMENT_STATUS_BADGE_VARIANT`'s own note on why it is the destructive one),
 * and a second copy of that mapping here would be a second place for the two
 * surfaces to start disagreeing about what red means.
 *
 * NO UPLOAD AFFORDANCE. §2.2 puts upload on Dokumenty, where the queue, the
 * retry and the duplicate detection live; a second entry point on the dashboard
 * would be a second implementation of all three. The card links there instead.
 *
 * PAYSLIPS CANNOT REACH THIS LIST — `listDocuments` excludes `doc_type =
 * 'payslip'` in the WHERE clause of every read (Advisor F13), server-side, so
 * this component never has to know they exist.
 */
export function RecentDocuments({
  orgSlug,
  documents,
}: {
  orgSlug: string
  documents: readonly DocumentSummary[]
}) {
  const t = useBetaTranslations()

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="font-heading text-lg">
          {t("prehled.documentsTitle")}
        </CardTitle>
        <Link
          href={`/${orgSlug}/dokumenty`}
          className="text-xs font-medium text-primary underline-offset-2 hover:underline"
        >
          {t("prehled.documentsAll")}
        </Link>
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("prehled.documentsEmpty")}
          </p>
        ) : (
          <ul className="grid gap-3">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border-subtle pb-2 last:border-0 last:pb-0"
              >
                <span className="min-w-0 truncate text-sm font-medium">
                  {doc.filename}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <Badge variant={DOCUMENT_STATUS_BADGE_VARIANT[doc.status]}>
                    {t(DOCUMENT_STATUS_LABEL_KEY[doc.status])}
                  </Badge>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatBetaDate(doc.uploadedAt)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
