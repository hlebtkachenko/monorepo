/**
 * `GET /api/orgs/[orgSlug]/documents/[documentId]/file` — the bytes.
 *
 * NO PRESIGNED URLS, EVER (plan Part 4). Every byte a client sees passes
 * through this handler, which means every byte is behind a resolved membership.
 * The alternative — mint a short-lived S3 URL — hands out a bearer credential
 * that outlives the check that produced it, is copy-pasteable out of the
 * product, and drags an `*.s3.amazonaws.com` origin into the CSP of every page
 * that renders a document.
 *
 * THE ID IS NEVER A KEY. The URL carries a document id; `openDocumentFile`
 * resolves it to a row filtered by the caller's own `organization_id` and reads
 * the storage key from THAT row. No request input reaches S3 — not a key, not a
 * prefix, not a filename — so there is no path traversal to defend against.
 * A valid id from another organization's book resolves to no row, and the
 * answer is the same 404 an invented id gets.
 *
 * RESPONSE HEADERS, and why each one is here:
 *
 *   Content-Disposition   `attachment` by default. `inline` when asked for and
 *                         the stored type allows it — see the disposition table
 *                         below. The filename is RFC 5987 encoded so `Nováková`
 *                         is not a header-injection surface.
 *   X-Content-Type-Options
 *                         `nosniff`. Without it a browser may re-sniff the body
 *                         and decide our `image/png` is really HTML.
 *   Content-Security-Policy
 *                         `DOCUMENT_FILE_CSP` — see the long note on it below.
 *                         It is applied by `next.config.mjs`, not by this
 *                         response object.
 *   Cross-Origin-Resource-Policy
 *                         `same-origin`. Another site cannot embed a client's
 *                         invoice as an `<img>` and probe for its existence.
 *   Cache-Control         `private, no-store`. This is one tenant's document on
 *                         a shared-tunnel origin; a shared cache must not keep
 *                         it and the browser must not restore it after a
 *                         session ends.
 *
 * THE THREE DISPOSITIONS, and what each is for:
 *
 *   (none)      `attachment` — the download button in the row sheet, and what a
 *               copied link does. The safe default for every stored type.
 *   `inline`    `inline` for PNG and JPEG only. The sheet's thumbnail renders
 *               these as a bare `<img>` INSIDE our own document context, so the
 *               set has to stay at types a browser cannot mistake for a
 *               document.
 *   `preview`   `inline` for PNG, JPEG and PDF. The sheet's preview FRAME,
 *               whose response is its own opaque origin under the CSP below.
 *               ALSO the one door to a HEIC's JPEG DERIVATIVE (PR 11): a HEIC
 *               row that has one answers this disposition with the JPEG's bytes,
 *               its own type and its own length, under a `.jpg` filename. HEIC
 *               stays out of `inline` and out of every other door — no non-Apple
 *               browser renders the original, so serving it inline would be a
 *               broken image rather than a preview.
 */
import { Readable } from "node:stream"

import { NextResponse } from "next/server"

import { openDocumentFile } from "@/lib/data/documents"
import { resolveOrgScope } from "@/lib/data/scope"
import {
  contentDispositionHeader,
  previewFilename,
} from "@/lib/storage/content-disposition"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * The Content-Security-Policy every response of THIS route carries.
 *
 * DECLARED HERE, APPLIED IN `next.config.mjs`. That split is not a style choice
 * — it is the only arrangement that works, and it was measured on a running
 * server rather than reasoned about:
 *
 *   A route handler that sets `content-security-policy` on its own Response has
 *   that header SILENTLY REPLACED by the site-wide `headers()` entry in
 *   `next.config.mjs` (matcher `/(.*)`, which matches API routes too). Verified
 *   against `next dev` with a probe route: a handler-set
 *   `default-src 'none'; sandbox` never reached the client — the response
 *   carried the site policy instead, including its `frame-ancestors 'none'`,
 *   while an unrelated header set by the same handler survived. So the value
 *   asserted by a unit test on the returned Response object is NOT the value a
 *   browser sees, and the PR 10 suite was asserting the wrong thing.
 *
 *   A SECOND, more specific `headers()` entry listed after the site-wide one
 *   overrides that single key for the matching path and leaves every other
 *   site-wide header (nosniff, Referrer-Policy, Permissions-Policy, HSTS,
 *   X-Robots-Tag) in place. Also measured. That is where this string is used.
 *
 * WHY THE VALUE IS WHAT IT IS:
 *
 *   `default-src 'none'`  the file's own document context loads nothing. A PDF
 *                         that tries to fetch anything gets nowhere.
 *   `sandbox`             no tokens — unique opaque origin, no scripts, no
 *                         forms, no downloads. This is what confines the
 *                         preview, and it confines it identically whether the
 *                         frame is reached from our sheet or the URL is typed
 *                         into the address bar. It is stronger than the iframe
 *                         `sandbox` ATTRIBUTE because the server sets it and no
 *                         embedding page can drop it.
 *   `frame-ancestors 'self'`
 *                         the one relaxation against the site-wide
 *                         `frame-ancestors 'none'`, and it is scoped to this
 *                         route alone: our own pages may frame a document,
 *                         nobody else's can. Every other route in the app keeps
 *                         `'none'`.
 *
 * ON THE IFRAME `sandbox` ATTRIBUTE, which the preview deliberately does NOT
 * carry: Chrome refuses to run its PDF viewer in any frame that has one — with
 * or without `allow-scripts` / `allow-same-origin` — and answers
 * `ERR_BLOCKED_BY_CLIENT`, so the attribute turns every PDF preview into an
 * error page while adding nothing the `sandbox` DIRECTIVE above does not
 * already enforce. Measured on Chrome 4×5 (attribute × policy); the frame
 * renders only with the attribute absent, and renders correctly under the
 * strict policy above.
 *
 * `document-file-headers.test.ts` asserts this constant and the string in
 * `next.config.mjs` have not drifted apart, over the real HTTP server.
 */
export const DOCUMENT_FILE_CSP =
  "default-src 'none'; sandbox; frame-ancestors 'self'"

type RouteContext = {
  params: Promise<{ orgSlug: string; documentId: string }>
}

function notFound(): NextResponse {
  return NextResponse.json(
    { error: "not_found" },
    {
      status: 404,
      headers: {
        "cache-control": "private, no-store, max-age=0",
        "x-content-type-options": "nosniff",
      },
    },
  )
}

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { orgSlug, documentId } = await context.params

  const scope = await resolveOrgScope(orgSlug)
  if (!scope) return notFound()

  // The request may ASK; the stored content type decides. An unrecognised
  // value — a stale link, a hand-edited URL — falls through to `attachment`.
  const asked = new URL(request.url).searchParams.get("disposition")

  // `preview` is the ONE door to the JPEG derivative (PR 11). `inline` is not,
  // deliberately: one door is one thing to reason about, and the sheet's HEIC
  // image points at `?disposition=preview` for exactly that reason. Everything
  // else — a copied link, a download button, `?disposition=inline` on a HEIC —
  // still gets the original bytes as an attachment.
  const handle = await openDocumentFile(scope, documentId, {
    variant: asked === "preview" ? "preview" : "original",
  })
  if (!handle) return notFound()

  const allowed =
    (asked === "inline" && handle.inlineAllowed) ||
    (asked === "preview" && handle.previewAllowed)
  const disposition = allowed ? "inline" : "attachment"

  return new NextResponse(
    Readable.toWeb(handle.body) as ReadableStream<Uint8Array>,
    {
      status: 200,
      headers: {
        // The type and length of THE BYTES BEING SENT, which on the derivative
        // are the JPEG's, not the HEIC row's. Sending the row's numbers next to
        // the derivative's bytes would be a `content-length` a browser truncates
        // the response to.
        "content-type": handle.contentType,
        "content-length": String(handle.byteSize),
        "content-disposition": contentDispositionHeader(
          disposition,
          handle.isDerivative
            ? previewFilename(handle.document.filename)
            : handle.document.filename,
        ),
        "x-content-type-options": "nosniff",
        // Dead weight on a running server — `next.config.mjs` replaces it (see
        // DOCUMENT_FILE_CSP) — and kept anyway, deliberately: it is the floor
        // if this handler is ever mounted somewhere that does not apply the
        // config's headers, and the same string in both places means the two
        // cannot disagree about what the policy IS. The drift test enforces
        // that. What it must never be again is the only place the policy
        // lives.
        "content-security-policy": DOCUMENT_FILE_CSP,
        "cross-origin-resource-policy": "same-origin",
        "cache-control": "private, no-store, max-age=0",
      },
    },
  )
}
