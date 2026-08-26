"use client"

import {
  isFramePreviewableContentType,
  isInlineSafeContentType,
} from "@/lib/storage/content-type"
import { useBetaTranslations } from "@/i18n/translations"

import type { DocumentSummary } from "@/lib/data/projections"

/**
 * The row sheet's preview surface (spec §2.2: "Row sheet: sandboxed preview").
 *
 * FOUR OUTCOMES, decided by the STORED content type — never by the filename:
 *
 *   PNG / JPEG   a plain `<img>` on `?disposition=inline`. These render inside
 *                our own document context, which is why the inline allowlist in
 *                `content-type.ts` is exactly these two.
 *   PDF          an `<iframe>` on `?disposition=preview`. The response carries
 *                `default-src 'none'; sandbox; frame-ancestors 'self'`, so the
 *                framed document is its own opaque origin with no scripting and
 *                no subresource loads, and only our own pages may frame it.
 *   HEIC WITH A DERIVATIVE (PR 11)
 *                a plain `<img>` on `?disposition=preview`, which is the ONE
 *                door to the server-generated JPEG (`lib/storage/heic-preview.ts`).
 *                The bytes that arrive are a JPEG and are declared as one, so
 *                this is the PNG/JPEG case wearing a different query parameter.
 *                `hasPreview` is a derived boolean on the projection — the sheet
 *                never learns the derivative's key, and asking for a preview
 *                that does not exist would answer with an attachment, which is
 *                why the flag is checked rather than assumed.
 *   anything else (a HEIC whose decode did not succeed)
 *                a line of Czech telling the client to download it. No non-Apple
 *                browser renders the original, and a frame that shows nothing is
 *                worse than a sentence that explains why.
 *
 * THE IFRAME HAS NO `sandbox` ATTRIBUTE, AND THAT IS THE POINT OF THE MEASURED
 * DESIGN. Chrome refuses to run its PDF viewer in a frame that carries one — any
 * token set, `allow-scripts allow-same-origin` included — and answers
 * `ERR_BLOCKED_BY_CLIENT`, so the attribute would turn every PDF preview into a
 * broken-file icon. The confinement is delivered by the RESPONSE instead, via
 * the `sandbox` directive in that route's CSP, which is strictly stronger: the
 * server sets it, so it holds for a typed URL exactly as it holds here, and no
 * embedding page can drop it. See `DOCUMENT_FILE_CSP` in the file route.
 *
 * `referrerPolicy` and `loading` are belt and braces: the app already sends
 * `Referrer-Policy: no-referrer` site-wide, and a preview that is never opened
 * should not fetch a document.
 */
export function DocumentPreview({
  document,
  fileUrl,
}: {
  document: DocumentSummary
  /** `/api/orgs/<slug>/documents/<id>/file`, without a query string. */
  fileUrl: string
}) {
  const t = useBetaTranslations()

  if (isInlineSafeContentType(document.contentType)) {
    // A bare `<img>`, not `next/image`: the optimizer would proxy a
    // per-tenant, `no-store` document through a shared pipeline and cache the
    // result on the server's disk. These bytes are one client's paperwork
    // behind a membership check, and they are already small — a phone photo
    // downscaled at upload (PR 11).

    return (
      <img
        src={`${fileUrl}?disposition=inline`}
        alt={document.filename}
        className="max-h-96 w-full rounded-lg border border-border object-contain"
      />
    )
  }

  if (document.hasPreview) {
    return (
      <img
        src={`${fileUrl}?disposition=preview`}
        alt={document.filename}
        className="max-h-96 w-full rounded-lg border border-border object-contain"
      />
    )
  }

  if (isFramePreviewableContentType(document.contentType)) {
    return (
      <iframe
        src={`${fileUrl}?disposition=preview`}
        title={t("dokumenty.previewFrameLabel")}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="h-96 w-full rounded-lg border border-border bg-muted"
      />
    )
  }

  return (
    <p className="text-sm text-muted-foreground">
      {t("dokumenty.previewUnavailable")}
    </p>
  )
}
