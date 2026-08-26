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
 *   Content-Disposition   `attachment` by default. `inline` ONLY for PNG and
 *                         JPEG, and only when asked for — a PDF served inline
 *                         is a document rendered by a plugin on this origin,
 *                         and beta's PDF preview is a sandboxed iframe (PR 12).
 *                         The filename is RFC 5987 encoded so `Nováková` is not
 *                         a header-injection surface.
 *   X-Content-Type-Options
 *                         `nosniff`. Without it a browser may re-sniff the body
 *                         and decide our `image/png` is really HTML.
 *   Content-Security-Policy
 *                         `default-src 'none'; sandbox` — applies to the FILE's
 *                         own document context if a browser ever renders it
 *                         top-level. Belt to `nosniff`'s braces.
 *   Cross-Origin-Resource-Policy
 *                         `same-origin`. Another site cannot embed a client's
 *                         invoice as an `<img>` and probe for its existence.
 *   Cache-Control         `private, no-store`. This is one tenant's document on
 *                         a shared-tunnel origin; a shared cache must not keep
 *                         it and the browser must not restore it after a
 *                         session ends.
 */
import { Readable } from "node:stream"

import { NextResponse } from "next/server"

import { openDocumentFile } from "@/lib/data/documents"
import { resolveOrgScope } from "@/lib/data/scope"
import { contentDispositionHeader } from "@/lib/storage/content-disposition"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

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

  const handle = await openDocumentFile(scope, documentId)
  if (!handle) return notFound()

  const wantsInline =
    new URL(request.url).searchParams.get("disposition") === "inline"
  // The request may ASK for inline; the stored content type decides. A PDF or a
  // HEIC is an attachment no matter what the query string says.
  const disposition =
    wantsInline && handle.inlineAllowed ? "inline" : "attachment"

  return new NextResponse(
    Readable.toWeb(handle.body) as ReadableStream<Uint8Array>,
    {
      status: 200,
      headers: {
        "content-type": handle.document.contentType,
        "content-length": String(handle.document.byteSize),
        "content-disposition": contentDispositionHeader(
          disposition,
          handle.document.filename,
        ),
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
        "cross-origin-resource-policy": "same-origin",
        "cache-control": "private, no-store, max-age=0",
      },
    },
  )
}
