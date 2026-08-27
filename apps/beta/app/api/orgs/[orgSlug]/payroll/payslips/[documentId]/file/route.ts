/**
 * `GET /api/orgs/[orgSlug]/payroll/payslips/[documentId]/file` — one
 * payslip's bytes, download only.
 *
 * A SEPARATE ROUTE FROM `documents/[documentId]/file`, NOT A SHARED ONE. That
 * route's `openDocumentFile` runs `visibleDocuments(scope)`, whose WHERE
 * clause EXCLUDES `doc_type = 'payslip'` outright (`documents.ts`'s own
 * header, filter 3) — so a payslip id there answers 404 regardless of role,
 * by design, and this route is the door spec §2.6 opens instead:
 * `openPayslipFile` (`lib/data/payslips.ts`) gates on `payrollScope()`, the
 * SAME visibility every other payroll read in this application uses.
 *
 * Same tenancy contract as the sibling route: the id is never a key,
 * `openPayslipFile` resolves it against the caller's own organization, and an
 * id from another book (or an ordinary document's id) answers the identical
 * 404 an invented id gets.
 *
 * ATTACHMENT ONLY. Spec §2.6 names "payslip PDFs", not a preview surface —
 * there is no sandboxed frame here and therefore no need for the sibling
 * route's `DOCUMENT_FILE_CSP` override; the site-wide `frame-ancestors
 * 'none'` is exactly right for a route that only ever streams a download.
 */
import { Readable } from "node:stream"

import { NextResponse } from "next/server"

import { openPayslipFile } from "@/lib/data/payslips"
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
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { orgSlug, documentId } = await context.params

  const scope = await resolveOrgScope(orgSlug)
  if (!scope) return notFound()

  const handle = await openPayslipFile(scope, documentId)
  if (!handle) return notFound()

  return new NextResponse(
    Readable.toWeb(handle.body) as ReadableStream<Uint8Array>,
    {
      status: 200,
      headers: {
        "content-type": handle.contentType,
        "content-length": String(handle.byteSize),
        "content-disposition": contentDispositionHeader(
          "attachment",
          handle.filename,
        ),
        "x-content-type-options": "nosniff",
        "cross-origin-resource-policy": "same-origin",
        "cache-control": "private, no-store, max-age=0",
      },
    },
  )
}
