/**
 * `POST /api/orgs/[orgSlug]/payroll/payslips` — one payslip PDF (spec §2.6
 * Výplatnice: "office bulk ZIP upload with filename→employee matching
 * preview").
 *
 * ONE FILE PER REQUEST, EVEN THOUGH THE UPLOAD IS "BULK". The ZIP is opened in
 * the BROWSER (`payslip-bulk-upload-form.tsx`, `jszip`), which is where the
 * matching preview lives too — a payslip archive is tens of independent PDFs,
 * not one dataset with a publish/rollback lifecycle, so there is no batch this
 * request needs to belong to. The client issues one request per accepted row
 * after the office confirms the preview, and this route reruns the exact
 * streaming discipline `documents/route.ts` established (raw body, metadata in
 * the query string, no multipart parser inside the boundary) — see that
 * file's own header for why.
 *
 * OWNER ONLY. `payroll.ts`'s header states the rule this route enforces:
 * writes to payroll data take an `OwnerScope`. A management seat that is not
 * the owner (admin, member) may read every payslip but may not add one — spec
 * §5 gives owner sole write authority over accounting data, and a payslip is
 * exactly that.
 */
import { NextResponse } from "next/server"

import {
  uploadPayslipDocument,
  type PayslipUploadRefusal,
} from "@/lib/data/payslips"
import { requireOwner, resolveOrgScope } from "@/lib/data/scope"
import { isCrossSiteWrite } from "@/lib/http/same-origin"
import { requestBodyChunks } from "@/lib/storage/upload-stream"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = {
  "cache-control": "private, no-store, max-age=0",
  "x-content-type-options": "nosniff",
} as const

function json(status: number, body: unknown): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

const REFUSAL_STATUS: Record<PayslipUploadRefusal, number> = {
  empty_body: 400,
  unsupported_type: 415,
  too_large: 413,
  invalid_filename: 400,
  unknown_employee: 400,
  unknown_period: 400,
  quota_exceeded: 413,
  retry: 409,
}

type RouteContext = { params: Promise<{ orgSlug: string }> }

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
  // Same shape as `documents/route.ts`'s own 403 note: a caller who IS a
  // member already knows this organization exists, so refusing the WRITE is
  // not the membership-oracle 404 an unknown slug gets.
  if (scope.role !== "owner") return json(403, { error: "forbidden" })

  const url = new URL(request.url)
  const filename = url.searchParams.get("filename")
  const employeeId = url.searchParams.get("employeeId")
  const periodId = url.searchParams.get("periodId")
  if (filename === null) return json(400, { error: "invalid_filename" })
  if (employeeId === null) return json(400, { error: "unknown_employee" })
  if (periodId === null) return json(400, { error: "unknown_period" })

  if (!request.body) return json(400, { error: "empty_body" })

  const owner = requireOwner(scope)

  const result = await uploadPayslipDocument(owner, {
    filename,
    employeeId,
    periodId,
    source: requestBodyChunks(request.body),
  })

  if (!result.ok) {
    return json(REFUSAL_STATUS[result.reason], { error: result.reason })
  }

  return json(result.status === "stored" ? 201 : 200, {
    status: result.status,
    ...(result.status === "stored" ? { documentId: result.documentId } : {}),
  })
}
