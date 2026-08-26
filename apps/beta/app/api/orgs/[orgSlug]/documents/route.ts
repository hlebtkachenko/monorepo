/**
 * `POST /api/orgs/[orgSlug]/documents` — upload a document.
 * `GET  /api/orgs/[orgSlug]/documents` — the org's document list.
 *
 * WHY A ROUTE HANDLER AND NOT A SERVER ACTION. A Server Action receives its
 * arguments already materialised — a `File` in a `FormData` is the whole file
 * in the task's heap before the first line of our code runs. The 25 MiB cap has
 * to be enforced on the stream, so the upload needs a handler that owns
 * `request.body` (plan Part 4: "25 MiB abort").
 *
 * WHY A RAW BODY AND NOT MULTIPART. `request.formData()` buffers, for the same
 * reason. Parsing multipart by hand to avoid that would mean writing a parser
 * for an attacker-supplied format inside the security boundary — strictly more
 * attack surface than reading the bytes as they are. So the file IS the body and
 * its metadata rides in the query string, where UTF-8 (`Faktura Nováková.pdf`)
 * is representable without inventing a header encoding.
 *
 * WHAT THE CLIENT'S `Content-Type` IS WORTH: nothing. It is not read. The stored
 * type is sniffed from the leading bytes (`lib/storage/content-type.ts`).
 *
 * THE SHAPE OF EVERY REFUSAL. 404 for "no such organization, for you" — that is
 * `resolveOrgScope`'s answer for an unknown slug, a missing session and a
 * membership the caller does not hold, all identical so the URL space is not a
 * membership oracle. 403 only for a caller who IS a member and may not do this
 * (a guest uploading): they already know the organization exists.
 */
import { NextResponse } from "next/server"

import {
  listDocuments,
  uploadDocument,
  type DocumentUploadRefusal,
} from "@/lib/data/documents"
import { resolveOrgScope } from "@/lib/data/scope"
import { isCrossSiteWrite } from "@/lib/http/same-origin"
import { requestBodyChunks } from "@/lib/storage/upload-stream"
import {
  BETA_CLIENT_DOCUMENT_TYPES,
  type BetaClientDocumentType,
} from "@/db/schema"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ orgSlug: string }> }

/**
 * Authenticated responses are never cached — not by a shared cache, not by the
 * browser's back/forward store. Applied to the JSON here for the same reason it
 * is applied to the bytes in the file route: the response is one tenant's data.
 */
const NO_STORE = {
  "cache-control": "private, no-store, max-age=0",
  "x-content-type-options": "nosniff",
} as const

function json(status: number, body: unknown): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

/** HTTP status for each refusal the data layer can answer with. */
const REFUSAL_STATUS: Record<DocumentUploadRefusal, number> = {
  forbidden: 403,
  invalid_filename: 400,
  empty_body: 400,
  unsupported_type: 415,
  too_large: 413,
  quota_exceeded: 413,
  retry: 409,
}

function isClientDocumentType(value: string): value is BetaClientDocumentType {
  return (BETA_CLIENT_DOCUMENT_TYPES as readonly string[]).includes(value)
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  if (isCrossSiteWrite(request.headers)) {
    return json(403, { error: "cross_site" })
  }

  const { orgSlug } = await context.params
  const scope = await resolveOrgScope(orgSlug)
  if (!scope) return json(404, { error: "not_found" })

  const url = new URL(request.url)
  const filename = url.searchParams.get("filename")
  if (filename === null) return json(400, { error: "invalid_filename" })

  const rawType = url.searchParams.get("docType")
  // `payslip` is not in `BETA_CLIENT_DOCUMENT_TYPES`, so a client cannot label
  // an upload as one — those rows are office-produced and payroll-scoped
  // (spec §2.2 / §2.6). An unknown value is a refusal rather than a silent
  // fallback to `other`: a typo that quietly mislabels a client's paperwork is
  // worse than an error the uploader can see.
  if (rawType !== null && !isClientDocumentType(rawType)) {
    return json(400, { error: "invalid_doc_type" })
  }
  const docType: BetaClientDocumentType = rawType ?? "other"

  if (!request.body) return json(400, { error: "empty_body" })

  const result = await uploadDocument(scope, {
    filename,
    docType,
    siteRef: url.searchParams.get("siteRef"),
    source: requestBodyChunks(request.body),
  })

  if (!result.ok) {
    return json(REFUSAL_STATUS[result.reason], { error: result.reason })
  }

  // 200 for a duplicate, 201 for a new row. The client needs to tell them
  // apart to show the "už jste nahráli" dialog of spec §2.2 rather than a
  // success toast, and the status code is the honest way to say "nothing was
  // created".
  return json(result.status === "stored" ? 201 : 200, {
    status: result.status,
    document: result.document,
  })
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { orgSlug } = await context.params
  const scope = await resolveOrgScope(orgSlug)
  if (!scope) return json(404, { error: "not_found" })

  return json(200, { documents: await listDocuments(scope) })
}
