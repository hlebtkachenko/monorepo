import "server-only"

/**
 * Mzdy › Výplatnice (spec §2.6): the payslip PDFs themselves, as opposed to
 * `payroll.ts`'s figures.
 *
 * A SEPARATE MODULE FROM `documents.ts`, DELIBERATELY. A payslip IS a `document`
 * row — same table, same bucket, same 25 MiB stream cap — but it reaches that
 * table through a different door for reasons `documents.ts`'s own header
 * already states: `uploadDocument`'s input type is `BetaClientDocumentType`,
 * which structurally EXCLUDES `"payslip"` (`db/schema/_enums.ts`), so no
 * change to that function could ever let a client's own upload declare one.
 * The write here takes an `OwnerScope`, not the `OrgScope` client uploads take
 * — spec §2.6 "office bulk ZIP upload" is an office act, and `payroll.ts`'s
 * own header states the same rule for its writes ("WRITES ARE OWNER-ONLY, by
 * parameter type"). Splitting the module rather than widening `documents.ts`
 * keeps that heavily-tested client-upload boundary completely unmoved by this
 * PR; the two write paths share the STORAGE primitives (`documentStore`,
 * `scanUpload`) and the quota reader (`organizationStorageUsage`), not the
 * transaction that decides what may be inserted.
 *
 * `payrollScope()` GATES EVERY READ HERE, THE SAME AS `payroll.ts`. A payslip
 * is payroll data before it is a document — an unlinked guest sees none, a
 * management seat sees every one, and an EMPLOYEE SEAT sees exactly its own
 * (spec §2.6.1), which is this module's sharpest obligation: a výplatní páska
 * carries a named person's net pay, and handing one to the wrong colleague is
 * the single worst outcome reachable from this application.
 *
 * THE EMPLOYEE PREDICATE IS BUILT HERE RATHER THAN IMPORTED, and that is the one
 * place this module deliberately does NOT reuse `payroll.ts`. Its
 * `employeeFilter` narrows `payroll_employee.id` — the REGISTER row. A payslip's
 * ownership lives on `document.payslip_employee_id`, and the two are only equal
 * on a row that has actually been joined. `payslipDocumentsForScope` does join
 * the register (it needs the name), so either column would work there; but
 * `openPayslipFile` deliberately does NOT join anything — it resolves one row by
 * id and streams bytes — and a filter that depended on a join being present is a
 * filter that disappears the day somebody drops the join. So both reads narrow
 * on `document.payslip_employee_id`, the column that is on the row being served.
 */
import type { Readable } from "node:stream"

import {
  and,
  asc,
  desc,
  eq,
  isNotNull,
  isNull,
  sql,
  type SQL,
} from "drizzle-orm"

import { betaDb } from "@/db/client"
import { document, organization, payroll_employee } from "@/db/schema"
import { isDeadlock, isUniqueViolation } from "@/lib/pg-error"
import { baseFilename } from "@/lib/storage/content-disposition"
import { documentStore } from "@/lib/storage/store"
import { scanUpload, type UploadScanRefusal } from "@/lib/storage/upload-stream"

import {
  ORGANIZATION_QUOTA_BYTES,
  organizationStorageUsage,
  softDeleteDocument,
} from "./documents"
import {
  payrollScope,
  publishedPayrollPeriods,
  type PayrollScope,
} from "./payroll"
import type { OrgScope, OwnerScope } from "./scope"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_FILENAME_LENGTH = 255

/** Both halves of the composite FK, restated the way `payroll.ts` always does. */
const employeeJoin = and(
  eq(payroll_employee.id, document.payslip_employee_id),
  eq(payroll_employee.organization_id, document.organization_id),
)

/**
 * WHOSE payslips this visibility may open — the conjunct both reads below AND
 * into their WHERE clause.
 *
 * Written as an exhaustive switch for the reason `payroll.ts`'s `employeeFilter`
 * is: the `never` arm turns a future widening of `PayrollScope` into a compile
 * error HERE, in the file where forgetting it means one employee downloading
 * another's payslip. The `none` arm returns a false predicate even though both
 * callers short-circuit before reaching it — the direction of that redundancy is
 * "nothing" rather than "everything".
 */
function payslipOwnerFilter(visibility: PayrollScope): SQL | undefined {
  switch (visibility.kind) {
    case "all":
      return undefined
    case "employee":
      return eq(document.payslip_employee_id, visibility.employeeId)
    case "none":
      return sql`false`
    default: {
      const unreachable: never = visibility
      return unreachable
    }
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export type PayslipDocumentView = {
  id: string
  filename: string
  byteSize: number
  uploadedAt: string
  employeeId: string
  employeeName: string
  periodId: string
}

/**
 * Every payslip this scope may see, newest first within each employee — the
 * Výplatnice list (spec §2.6), optionally narrowed to one period.
 *
 * `payslip_employee_id` / `payslip_period_id` ARE NULLABLE COLUMNS (they
 * predate this PR — `db/schema/document.ts` calls them "groundwork" — and
 * nothing in this codebase but `uploadPayslipDocument` below ever sets them),
 * so the WHERE clause requires both non-null and the mapping below still
 * narrows the TypeScript type with a filter rather than a cast: a payslip row
 * this function's own writer did not produce is not shown rather than shown
 * with an empty id.
 */
export async function payslipDocumentsForScope(
  scope: OrgScope,
  options: { periodId?: string } = {},
): Promise<PayslipDocumentView[]> {
  const visibility = payrollScope(scope)
  if (visibility.kind === "none") return []

  const rows = await betaDb()
    .select({
      id: document.id,
      original_filename: document.original_filename,
      byte_size: document.byte_size,
      created_at: document.created_at,
      payslip_employee_id: document.payslip_employee_id,
      payslip_period_id: document.payslip_period_id,
      full_name: payroll_employee.full_name,
    })
    .from(document)
    .innerJoin(payroll_employee, employeeJoin)
    .where(
      and(
        eq(document.organization_id, scope.organizationId),
        eq(document.doc_type, "payslip"),
        isNull(document.deleted_at),
        isNotNull(document.payslip_employee_id),
        isNotNull(document.payslip_period_id),
        options.periodId
          ? eq(document.payslip_period_id, options.periodId)
          : undefined,
        payslipOwnerFilter(visibility),
      ),
    )
    .orderBy(asc(payroll_employee.full_name), desc(document.created_at))

  return rows
    .map((row) => ({
      id: row.id,
      filename: row.original_filename,
      byteSize: row.byte_size,
      uploadedAt: row.created_at.toISOString(),
      employeeId: row.payslip_employee_id,
      employeeName: row.full_name,
      periodId: row.payslip_period_id,
    }))
    .filter(
      (row): row is PayslipDocumentView =>
        row.employeeId !== null && row.periodId !== null,
    )
}

export type PayslipFileHandle = {
  filename: string
  contentType: string
  byteSize: number
  body: Readable
}

/**
 * Open one payslip's bytes for streaming — the Výplatnice download link.
 *
 * Download only, never a preview frame: unlike `documents.ts`'s general file
 * route, nothing here needs an `inline`/`preview` disposition, so this handle
 * carries no derivative and no `inlineAllowed` — the route this backs always
 * answers `attachment`.
 */
export async function openPayslipFile(
  scope: OrgScope,
  documentId: string,
): Promise<PayslipFileHandle | null> {
  const visibility = payrollScope(scope)
  if (visibility.kind === "none") return null
  if (!UUID.test(documentId)) return null

  const [row] = await betaDb()
    .select({
      original_filename: document.original_filename,
      content_type: document.content_type,
      byte_size: document.byte_size,
      storage_key: document.storage_key,
    })
    .from(document)
    .where(
      and(
        eq(document.organization_id, scope.organizationId),
        eq(document.doc_type, "payslip"),
        eq(document.id, documentId),
        isNull(document.deleted_at),
        // The cross-EMPLOYEE fence, on the same row as the cross-ORG one. An
        // employee seat holding a colleague's document id gets the identical
        // 404 an invented id gets — the route (`payroll/payslips/[documentId]/
        // file`) has no other refusal to fall back on.
        payslipOwnerFilter(visibility),
      ),
    )
    .limit(1)

  if (!row) return null

  const body = await documentStore().get(row.storage_key, scope.organizationId)

  return {
    filename: row.original_filename,
    contentType: row.content_type,
    byteSize: row.byte_size,
    body,
  }
}

// ---------------------------------------------------------------------------
// Write — the bulk upload's per-file call (spec §2.6 Výplatnice)
// ---------------------------------------------------------------------------

export type PayslipUploadRefusal =
  | UploadScanRefusal
  | "invalid_filename"
  /** `employeeId` names no row in this organization's register. */
  | "unknown_employee"
  /** `periodId` has no PUBLISHED payroll batch — see `publishedPayrollPeriods`. */
  | "unknown_period"
  | "quota_exceeded"
  /** Postgres broke a lock cycle and picked this transaction; try again. */
  | "retry"

export type PayslipUploadResult =
  | { ok: true; status: "stored"; documentId: string }
  | {
      /**
       * The organization-wide `(organization_id, sha256)` unique index caught
       * a byte-identical file already on this book — same defence
       * `documents.ts`'s upload has, reached here because the store is
       * shared. Unlike that path this answers no twin's projection: a bulk
       * office upload has no "open it" affordance to offer, only "already
       * stored", which the preview's per-row status renders as such.
       */
      ok: true
      status: "duplicate"
    }
  | { ok: false; reason: PayslipUploadRefusal }

export type PayslipUploadInput = {
  filename: string
  employeeId: string
  periodId: string
  /** The request body. Consumed at most once. */
  source: AsyncIterable<Uint8Array>
}

function normalizeFilename(raw: string): string | null {
  const name = baseFilename(raw)
  if (name.length === 0 || name.length > MAX_FILENAME_LENGTH) return null
  for (let index = 0; index < name.length; index += 1) {
    const code = name.charCodeAt(index)
    if (code < 0x20 || code === 0x7f) return null
  }
  return name
}

/**
 * Store one payslip PDF and link it to an employee and a period.
 *
 * SAME PIPELINE AS `documents.ts`'s `uploadDocument` — stream, sniff, store,
 * then a locked quota-checked insert — with two things this call does not
 * need: the client-visibility duplicate gate (there is no non-owner reader of
 * the RESULT here, only of the list `payslipDocumentsForScope` renders once
 * the row exists) and a pre-INSERT duplicate lookup (this function does not
 * hand back the twin's own fields, so catching the unique-violation AFTER an
 * attempted insert is enough — see the result type's own comment).
 */
export async function uploadPayslipDocument(
  owner: OwnerScope,
  input: PayslipUploadInput,
): Promise<PayslipUploadResult> {
  const filename = normalizeFilename(input.filename)
  if (filename === null) return { ok: false, reason: "invalid_filename" }

  const [employee] = await betaDb()
    .select({ id: payroll_employee.id })
    .from(payroll_employee)
    .where(
      and(
        eq(payroll_employee.id, input.employeeId),
        eq(payroll_employee.organization_id, owner.organizationId),
      ),
    )
    .limit(1)
  if (!employee) return { ok: false, reason: "unknown_employee" }

  const periods = await publishedPayrollPeriods(owner)
  const period = periods.find((candidate) => candidate.id === input.periodId)
  if (!period) return { ok: false, reason: "unknown_period" }

  const usage = await organizationStorageUsage(owner)
  if (usage.usedBytes >= usage.quotaBytes) {
    return { ok: false, reason: "quota_exceeded" }
  }

  const scan = await scanUpload(input.source)
  if (!scan.ok) return { ok: false, reason: scan.reason }

  const store = documentStore()
  const put = await store.put({
    organizationId: owner.organizationId,
    contentType: scan.type.contentType,
    extension: scan.type.extension,
    body: scan.body,
  })
  const key = put.key
  const digest = await scan.settled

  const discard = async (): Promise<void> => {
    try {
      await store.delete(key, owner.organizationId)
    } catch {
      // Best effort — see `documents.ts`'s twin comment. The retention job
      // (PR 37) sweeps any orphan this leaves behind.
    }
  }

  try {
    const outcome = await betaDb().transaction(async (tx) => {
      // The same row lock `documents.ts` takes, serialising the quota
      // arithmetic against every other writer of this organization's
      // documents — client uploads included, since they share the quota.
      await tx
        .select({ id: organization.id })
        .from(organization)
        .where(eq(organization.id, owner.organizationId))
        .for("no key update")

      const [used] = await tx
        .select({ total: sql<string>`coalesce(sum(${document.byte_size}), 0)` })
        .from(document)
        .where(
          and(
            eq(document.organization_id, owner.organizationId),
            isNull(document.deleted_at),
          ),
        )

      if (
        Number(used?.total ?? 0) + digest.byteSize >
        ORGANIZATION_QUOTA_BYTES
      ) {
        return { kind: "quota" as const }
      }

      const [inserted] = await tx
        .insert(document)
        .values({
          organization_id: owner.organizationId,
          doc_type: "payslip",
          original_filename: filename,
          storage_key: key,
          content_type: scan.type.contentType,
          extension: scan.type.extension,
          byte_size: digest.byteSize,
          sha256: digest.sha256,
          // Visible from the day the employee seat (PR 33) lands: §2.6.1's
          // "Moje mzda" is "own lines and payslips", and this row's own
          // visibility is what `payrollScope`'s future `employee` arm will
          // read alongside `payslip_employee_id`.
          visible_to_client: true,
          payslip_employee_id: input.employeeId,
          payslip_period_id: input.periodId,
          uploaded_by_user_id: owner.userId,
        })
        .returning({ id: document.id })

      return { kind: "stored" as const, id: inserted?.id }
    })

    if (outcome.kind === "quota") {
      await discard()
      return { ok: false, reason: "quota_exceeded" }
    }
    if (!outcome.id) throw new Error("payslip insert returned no row")
    return { ok: true, status: "stored", documentId: outcome.id }
  } catch (error) {
    await discard()
    if (isUniqueViolation(error)) {
      return { ok: true, status: "duplicate" }
    }
    if (isDeadlock(error)) return { ok: false, reason: "retry" }
    throw error
  }
}

/**
 * WITHDRAW A PAYSLIP THAT WAS FILED AGAINST THE WRONG PERSON.
 *
 * The worst outcome reachable from this application, per this module's own
 * header, is a výplatní páska served to the wrong colleague.
 * `uploadPayslipDocument` stamps `payslip_employee_id` from the office's
 * matching pass, and a bulk ZIP matched by name against a register holding two
 * Nováks is exactly where that stamp goes wrong.
 *
 * Until now there was no way to take it back. `softDeleteDocument`
 * (`lib/data/documents.ts`) has been the mechanism the whole time and has had
 * NO CALLER AT ALL — so the remediation existed only as a function nobody could
 * find from the surface that needs it.
 *
 * WITHDRAWAL, NOT RE-STAMPING. The tempting shape is "point the row at the
 * right employee", and it is the wrong one: a payslip already readable by the
 * wrong person is not made unread by correcting a column, the office still has
 * to tell someone, and the row is the evidence of what was served and to whom.
 * Withdrawing it and uploading again against the correct employee leaves both
 * facts in the book — one row that was wrong and was retracted, one row that is
 * right — where a mutation would leave a single row that has always looked
 * correct.
 *
 * IT REFUSES A NON-PAYSLIP, which is why this is a named function rather than a
 * `softDeleteDocument` call at the call site. That function withdraws ANY
 * document in the book, so a payroll-remediation surface wired straight to it
 * would be a payroll surface that can delete invoices and bank statements. The
 * `doc_type = 'payslip'` check makes this door carry the narrowest authority
 * that does the job.
 *
 * THE BYTES SURVIVE, deliberately. Every read in this module filters
 * `deleted_at IS NULL`, so the row leaves Výplatnice and the employee's Moje
 * mzda at once, while the object stays recoverable until an operator runs
 * `purgeOrganization`. A mis-assignment is a mistake, and mistakes get undone.
 */
export async function withdrawMisassignedPayslip(
  scope: OwnerScope,
  documentId: string,
): Promise<boolean> {
  if (!UUID.test(documentId)) return false

  const [payslip] = await betaDb()
    .select({ id: document.id })
    .from(document)
    .where(
      and(
        eq(document.id, documentId),
        eq(document.organization_id, scope.organizationId),
        eq(document.doc_type, "payslip"),
        isNull(document.deleted_at),
      ),
    )
    .limit(1)

  if (!payslip) return false

  return softDeleteDocument(scope, documentId)
}
