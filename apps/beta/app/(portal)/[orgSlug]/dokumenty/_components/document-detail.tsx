"use client"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"

import {
  formatAmount,
  formatBytes,
  formatDate,
  formatDateTime,
} from "@/i18n/format-values"
import { useBetaTranslations } from "@/i18n/translations"
import type { DocumentSummary } from "@/lib/data/projections"

import { DocumentPreview } from "./document-preview"
import {
  DOCUMENT_STATUS_BADGE_VARIANT,
  DOCUMENT_STATUS_LABEL_KEY,
  DOCUMENT_TYPE_LABEL_KEY,
} from "./labels"

/**
 * The body of the row sheet (spec §2.2): the preview, the fields, the office's
 * message, and the download.
 *
 * READ-ONLY, DELIBERATELY AND COMPLETELY. Spec §3.3 makes Pro účetní › Zadávání
 * dat the only editing home for non-document data and §3.1 makes the Zpracování
 * queue the only place a document's fields are edited; every client page is a
 * read. So there is no form here, no status control and no delete — not disabled
 * ones either, because a greyed-out button still tells the client the capability
 * exists and is being withheld. The spec's "Upravit" deep-link for the owner is
 * absent for the same reason: its target is the Zpracování sheet, which PR 14
 * builds, and a link to a route that does not exist yet is exactly the
 * placeholder the campaign forbids. PR 14 adds the link together with the page
 * it points at.
 *
 * `officeMessage` is the one field with a reason to shout: it is mandatory for a
 * `returned` document (a DB CHECK enforces that), and it is the sentence that
 * tells the client what to fix.
 */
export function DocumentDetail({
  document,
  fileUrl,
}: {
  document: DocumentSummary
  fileUrl: string
}) {
  const t = useBetaTranslations()
  const dash = t("dokumenty.detailEmptyValue")

  const fields: { label: string; value: string }[] = [
    {
      label: t("dokumenty.detailType"),
      value: t(DOCUMENT_TYPE_LABEL_KEY[document.docType]),
    },
    {
      label: t("dokumenty.detailUploaded"),
      value: formatDateTime(document.uploadedAt) ?? dash,
    },
    {
      label: t("dokumenty.detailDocumentDate"),
      value: formatDate(document.documentDate) ?? dash,
    },
    {
      label: t("dokumenty.detailAmount"),
      value: formatAmount(document.amount) ?? dash,
    },
    { label: t("dokumenty.detailSite"), value: document.siteRef ?? dash },
    {
      label: t("dokumenty.detailSize"),
      value: formatBytes(document.byteSize),
    },
  ]

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <h3 className="text-sm font-medium">{t("dokumenty.previewTitle")}</h3>
        <DocumentPreview document={document} fileUrl={fileUrl} />
      </div>

      <Button asChild variant="outline" size="lg" className="w-fit">
        {/* A plain anchor, not a fetch: the response is a stream with an
            RFC 5987 filename, and letting the browser own the download is what
            keeps a 25 MiB file out of the tab's memory. */}
        <a href={fileUrl} download>
          {t("dokumenty.download")}
        </a>
      </Button>

      <dl className="grid gap-2">
        <div className="grid grid-cols-[9rem_1fr] items-baseline gap-2">
          <dt className="text-sm text-muted-foreground">
            {t("dokumenty.detailStatus")}
          </dt>
          <dd>
            <Badge variant={DOCUMENT_STATUS_BADGE_VARIANT[document.status]}>
              {t(DOCUMENT_STATUS_LABEL_KEY[document.status])}
            </Badge>
          </dd>
        </div>
        {fields.map((field) => (
          <div
            key={field.label}
            className="grid grid-cols-[9rem_1fr] items-baseline gap-2"
          >
            <dt className="text-sm text-muted-foreground">{field.label}</dt>
            <dd className="text-sm">{field.value}</dd>
          </div>
        ))}
      </dl>

      {document.officeMessage ? (
        <div className="grid gap-1 rounded-lg border border-border bg-muted/40 p-3">
          <h3 className="text-sm font-medium">
            {t("dokumenty.detailOfficeMessage")}
          </h3>
          <p className="text-sm whitespace-pre-line">
            {document.officeMessage}
          </p>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {t("dokumenty.detailReadOnly")}
      </p>
    </div>
  )
}
