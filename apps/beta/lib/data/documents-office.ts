import "server-only"

/**
 * Pro účetní › Zpracování (spec §3.1) — the owner-only write layer over
 * `document`.
 *
 * NOT `lib/data/office/**`. That directory is the CROSS-ORG /admin layer,
 * gated by `OfficeScope` (`requireOffice()`), and has no organization filter
 * because /admin is above organizations. This module is the opposite shape:
 * every function is scoped to ONE book and gated by `OwnerScope`
 * (`requireOwner()`), the office's write door INSIDE an organization the
 * office already has a membership in. Two different doors, two different
 * files, on purpose — see `lib/data/scope.ts`'s header on `OwnerScope`.
 *
 * EVERY WRITE TAKES AN `OwnerScope`, NOT AN `OrgScope`. `documents.ts`'s own
 * `softDeleteDocument` re-checks `scope.role !== "owner"` by hand because it
 * predates this brand; every function added here instead makes "owner only"
 * a parameter type, so a future caller cannot reach a Zpracování write with a
 * member's or a guest's handle even by mistake — the compiler refuses it
 * before the function body ever runs.
 */
import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm"

import { betaDb } from "@/db/client"
import {
  document,
  type BetaClientDocumentType,
  type BetaDocumentStatus,
} from "@/db/schema"
import {
  documentAttentionTrigger,
  notifyDocumentAttention,
} from "@/lib/notifications/events"
import { isCheckViolation } from "@/lib/pg-error"

import { normalizeSiteRef } from "./documents"
import { notifiableOrgMembers } from "./notification-prefs"
import { organizationForScope } from "./organizations"
import { partnerExists } from "./partners"
import { ownerDocumentDetail, type OwnerDocumentDetail } from "./projections"
import type { OwnerScope } from "./scope"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
/** `numeric(14,2)`: up to 12 integer digits, an optional 2-decimal fraction. */
const AMOUNT_PATTERN = /^-?\d{1,12}(\.\d{1,2})?$/

/** The queue is bounded — an office runs a handful of client books, not a
 * warehouse. Large enough that pagination is PR 25's problem, not this one's. */
const QUEUE_LIST_LIMIT = 300

const detailColumns = {
  id: document.id,
  original_filename: document.original_filename,
  doc_type: document.doc_type,
  status: document.status,
  content_type: document.content_type,
  byte_size: document.byte_size,
  created_at: document.created_at,
  uploaded_by_user_id: document.uploaded_by_user_id,
  document_date: document.document_date,
  amount: document.amount,
  site_ref: document.site_ref,
  office_message: document.office_message,
  internal_note: document.internal_note,
  visible_to_client: document.visible_to_client,
  partner_id: document.partner_id,
}

/**
 * Every document the office may work on this book — soft-deleted and
 * payslip rows excluded, same as `documents.ts`'s `visibleDocuments`, MINUS
 * the `visible_to_client` gate: the owner IS the accountant and always sees
 * the whole book, hidden layer included, which is the entire point of this
 * module existing.
 *
 * Payslips stay excluded even here: they are not client-uploaded documents
 * awaiting review, they are office-produced payroll artefacts (spec §2.2,
 * §2.6 Výplatnice, PR 31), and nothing in this codebase produces a
 * `doc_type = 'payslip'` row yet — `uploadDocument`'s input type cannot
 * declare one (`BetaClientDocumentType`). Keeping the filter here now, before
 * PR 31 exists, means Zpracování never needs a second migration to add it
 * later.
 */
function ownerQueueDocuments(scope: OwnerScope) {
  return and(
    eq(document.organization_id, scope.organizationId),
    isNull(document.deleted_at),
    ne(document.doc_type, "payslip"),
  )
}

function normalizeText(value: string | null): string | null {
  if (value === null) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** received/in_processing (spec §3.1's queue), received first, then oldest first. */
export const QUEUE_DEFAULT_STATUSES: readonly BetaDocumentStatus[] = [
  "received",
  "in_processing",
]

export async function listQueueDocuments(
  owner: OwnerScope,
  options: { statuses?: readonly BetaDocumentStatus[] } = {},
): Promise<OwnerDocumentDetail[]> {
  const statuses = options.statuses ?? QUEUE_DEFAULT_STATUSES

  const rows = await betaDb()
    .select(detailColumns)
    .from(document)
    .where(and(ownerQueueDocuments(owner), inArray(document.status, statuses)))
    // `received` rows first, then oldest first within each group — spec §3.1
    // verbatim ("Queue (received/in_processing, oldest first)"). One ORDER BY
    // rather than a UNION of two queries, so a status filter that drops
    // `received` entirely still degrades to a plain oldest-first list.
    .orderBy(
      desc(sql`(${document.status} = 'received')`),
      asc(document.created_at),
    )
    .limit(QUEUE_LIST_LIMIT)

  return rows.map(ownerDocumentDetail)
}

/** One document, the office's own view of it — the row sheet's read. */
export async function documentDetailForOwner(
  owner: OwnerScope,
  documentId: string,
): Promise<OwnerDocumentDetail | null> {
  if (!UUID.test(documentId)) return null

  const [row] = await betaDb()
    .select(detailColumns)
    .from(document)
    .where(and(ownerQueueDocuments(owner), eq(document.id, documentId)))
    .limit(1)

  return row ? ownerDocumentDetail(row) : null
}

// ---------------------------------------------------------------------------
// The status state machine (spec §2.2 / §3.1)
// ---------------------------------------------------------------------------

/**
 * The legal transition graph, spelled out as data rather than as a chain of
 * `if`s — so the exhaustive matrix test in `documents-office.test.ts` can walk
 * every one of the 16 `(from, to)` pairs against this ONE table instead of
 * against the write function's control flow.
 *
 *   received      → in_processing | processed | returned
 *   in_processing → received | processed | returned
 *   processed     → in_processing
 *   returned      → in_processing
 *
 * Every self-loop (`X → X`) is deliberately ILLEGAL here — resaving the SAME
 * status is not a transition, it is a no-op, and `saveDocumentOffice` below
 * never calls this function for one (see its own comment). `processed` and
 * `returned` can each only go back to `in_processing`: closing the loop
 * always passes back through the accountant's own working state, so
 * "processed" or "returned" can never jump straight to `received` (that would
 * silently drop the fact that this document was already looked at once) or,
 * from `returned`, straight to `processed` (the whole point of `returned` is
 * that the accountant has NOT yet re-reviewed it).
 */
const LEGAL_TRANSITIONS: Record<
  BetaDocumentStatus,
  readonly BetaDocumentStatus[]
> = {
  received: ["in_processing", "processed", "returned"],
  in_processing: ["received", "processed", "returned"],
  processed: ["in_processing"],
  returned: ["in_processing"],
}

export function isLegalStatusTransition(
  from: BetaDocumentStatus,
  to: BetaDocumentStatus,
): boolean {
  return LEGAL_TRANSITIONS[from].includes(to)
}

// ---------------------------------------------------------------------------
// The one write: the edit-mode document sheet (spec §3.1 — "the ONLY place
// document fields are edited")
// ---------------------------------------------------------------------------

/**
 * Every field the office may change from one save. `undefined` on any key
 * means "leave this column untouched" — the same three-state convention
 * `office/organizations.ts`'s `setOrganizationVatRegime` pair uses, so a
 * quick one-field queue action (say, a status bump with no other edits) and
 * the full edit-mode sheet (every field at once) go through the identical
 * function.
 */
export type DocumentOfficePatch = {
  status?: BetaDocumentStatus
  /** `null` clears it. Required (by the DB, and pre-checked here) when the
   * EFFECTIVE next status is `returned`. */
  officeMessage?: string | null
  /** The office's own layer. Never reaches a client projection. */
  internalNote?: string | null
  clientVisible?: boolean
  /** Never `"payslip"` — that relabelling is PR 31's own upload path, not an
   * edit an office user makes from this sheet. */
  docType?: BetaClientDocumentType
  documentDate?: string | null
  /** `numeric(14,2)` as the exact decimal text the office typed — never
   * parsed to a `number` here (spec §0.7: beta never computes). */
  amount?: string | null
  siteRef?: string | null
  /**
   * Protistrana (spec §2.2, §4's `document.partner_id`, PR 29). `null` clears
   * it — the office un-linking a document from a partner is a real edit, not
   * "leave it alone".
   */
  partnerId?: string | null
}

export type DocumentOfficeRefusal =
  | "not_found"
  | "illegal_transition"
  /** Spec §2.2: "Returned requires office_message." Refused before the write
   * when detectable from the patch alone; the DB CHECK is still the backstop
   * for the concurrent-clear case (caught via `isCheckViolation` below). */
  | "message_required"
  | "invalid_date"
  | "invalid_amount"
  /** `partnerId` names no partner of this book — either a typo in a hand-built
   * POST, or a partner from another organization. The composite FK
   * (`document_partner_fk`) would refuse it anyway; checked here first so the
   * office gets a Czech sentence rather than a 500. */
  | "invalid_partner"
  /** Another write landed on this row between the read and the write. Not a
   * fault — the caller re-opens the sheet and tries again, the same shape of
   * refusal `office/memberships.ts` calls `"retry"`. */
  | "conflict"

export type DocumentOfficeResult =
  | { ok: true; document: OwnerDocumentDetail }
  | { ok: false; reason: DocumentOfficeRefusal }

/**
 * Resolve recipients and org identity, then send — the part of the spec
 * §2.11 event-1 notification that needs the database. `documentAttentionTrigger`
 * (pure, `lib/notifications/events.ts`) already decided this should fire;
 * this function's only job is fetching who "the client" is right now.
 */
async function dispatchDocumentAttentionNotification(
  owner: OwnerScope,
  detail: OwnerDocumentDetail,
): Promise<void> {
  if (detail.officeMessage === null) return
  const [recipients, org] = await Promise.all([
    notifiableOrgMembers(owner.organizationId),
    organizationForScope(owner),
  ])
  await notifyDocumentAttention(recipients, {
    orgSlug: owner.organizationSlug,
    organizationName: org.legalName,
    filename: detail.filename,
    officeMessage: detail.officeMessage,
  })
}

export async function saveDocumentOffice(
  owner: OwnerScope,
  documentId: string,
  patch: DocumentOfficePatch,
): Promise<DocumentOfficeResult> {
  if (!UUID.test(documentId)) return { ok: false, reason: "not_found" }

  if (
    patch.documentDate !== undefined &&
    patch.documentDate !== null &&
    !ISO_DATE.test(patch.documentDate)
  ) {
    return { ok: false, reason: "invalid_date" }
  }
  if (
    patch.amount !== undefined &&
    patch.amount !== null &&
    !AMOUNT_PATTERN.test(patch.amount)
  ) {
    return { ok: false, reason: "invalid_amount" }
  }
  if (patch.partnerId !== undefined && patch.partnerId !== null) {
    if (!UUID.test(patch.partnerId))
      return { ok: false, reason: "invalid_partner" }
    if (!(await partnerExists(owner, patch.partnerId)))
      return { ok: false, reason: "invalid_partner" }
  }

  const [current] = await betaDb()
    .select({
      status: document.status,
      office_message: document.office_message,
    })
    .from(document)
    .where(and(ownerQueueDocuments(owner), eq(document.id, documentId)))
    .limit(1)

  if (!current) return { ok: false, reason: "not_found" }

  // A STATUS FIELD EQUAL TO THE CURRENT VALUE IS NOT A TRANSITION. The
  // edit-mode sheet always submits every field, status included, so most
  // saves carry `patch.status === current.status` — the office changed the
  // amount, not the state. Only an ACTUAL change is checked against the
  // graph; `LEGAL_TRANSITIONS` has no self-loops precisely because this is
  // the only place that would ever ask it about one.
  if (
    patch.status !== undefined &&
    patch.status !== current.status &&
    !isLegalStatusTransition(current.status, patch.status)
  ) {
    return { ok: false, reason: "illegal_transition" }
  }

  const nextStatus = patch.status ?? current.status
  const nextMessage =
    patch.officeMessage !== undefined
      ? normalizeText(patch.officeMessage)
      : current.office_message
  if (nextStatus === "returned" && nextMessage === null) {
    return { ok: false, reason: "message_required" }
  }

  const values: Partial<typeof document.$inferInsert> = {}
  if (patch.status !== undefined) values.status = patch.status
  if (patch.officeMessage !== undefined) values.office_message = nextMessage
  if (patch.internalNote !== undefined) {
    values.internal_note = normalizeText(patch.internalNote)
  }
  if (patch.clientVisible !== undefined) {
    values.visible_to_client = patch.clientVisible
  }
  if (patch.docType !== undefined) values.doc_type = patch.docType
  if (patch.documentDate !== undefined)
    values.document_date = patch.documentDate
  if (patch.amount !== undefined) values.amount = patch.amount
  if (patch.siteRef !== undefined) {
    values.site_ref = normalizeSiteRef(patch.siteRef)
  }
  if (patch.partnerId !== undefined) values.partner_id = patch.partnerId

  try {
    if (Object.keys(values).length === 0) {
      // Every key was `undefined` — the sheet was opened and saved with
      // nothing changed. Read back the current row rather than refuse: an
      // empty diff is not an error, and the caller (a form resubmit) should
      // not have to special-case it.
      const [row] = await betaDb()
        .select(detailColumns)
        .from(document)
        .where(and(ownerQueueDocuments(owner), eq(document.id, documentId)))
        .limit(1)
      if (!row) return { ok: false, reason: "not_found" }
      return { ok: true, document: ownerDocumentDetail(row) }
    }

    const updated = await betaDb()
      .update(document)
      .set(values)
      .where(
        and(
          eq(document.organization_id, owner.organizationId),
          eq(document.id, documentId),
          // The optimistic re-check: the WHERE clause is evaluated again once
          // Postgres has the row's lock, so if another write already moved
          // this document's status away from what we read, this UPDATE
          // matches zero rows instead of silently clobbering it.
          eq(document.status, current.status),
        ),
      )
      .returning(detailColumns)

    const [row] = updated
    if (!row) return { ok: false, reason: "conflict" }
    const detail = ownerDocumentDetail(row)

    // Post-commit notification (spec §2.11 event 1). The UPDATE above already
    // committed — this function opens no explicit transaction, so a single
    // Postgres statement IS the commit — and `documentAttentionTrigger`
    // compares the row read BEFORE the write against the row this UPDATE
    // actually returned, never the caller's patch. Fire-and-forget: `void`
    // plus a `.catch` so a transport failure is logged, never thrown into
    // this write's own caller.
    if (
      documentAttentionTrigger(
        { status: current.status, officeMessage: current.office_message },
        { status: detail.status, officeMessage: detail.officeMessage },
      )
    ) {
      void dispatchDocumentAttentionNotification(owner, detail).catch(
        (error: unknown) => {
          console.error(
            "[beta:notifications] document-attention dispatch failed",
            error,
          )
        },
      )
    }

    return { ok: true, document: detail }
  } catch (error) {
    // The DB CHECK (`document_returned_requires_message`) is the backstop for
    // the one case the pre-check above cannot see: another write clears the
    // message on a row this call is independently trying to move (or hold)
    // at `returned`, in the gap between the SELECT and the UPDATE.
    if (isCheckViolation(error))
      return { ok: false, reason: "message_required" }
    throw error
  }
}
