import { captureDocument } from "./capture"
import { bookDocument } from "./predkontace/book-document"
import type { RowExecutor } from "./sql"
import type { CapturedDocument, DocumentInput, OrgCtx } from "./types"

/**
 * RECEIVED_INVOICE / ISSUED_INVOICE — the only doklad types that carry a
 * předkontace + a saldokonto obligation. Cash / bank / internal / batch
 * vouchers capture only; they never book through předkontace here.
 */
const INVOICE_TYPES = new Set<DocumentInput["type"]>([
  "RECEIVED_INVOICE",
  "ISSUED_INVOICE",
])

export interface CaptureAndBookResult {
  doc: CapturedDocument
  /** Present only for an invoice type: one posting id per booked event. */
  postingIds?: string[]
}

/**
 * Capture a doklad, then — iff it is an invoice type — book its předkontace and
 * open the saldokonto obligation in the SAME transaction (PR #712 / #715). This
 * is the single "capture-approve of a doklad" unit every gated-write approve
 * path shares (API held-write resolve + web approvals), so an approved invoice
 * always lands ONE fully-wired accounting fact — summary_record + posting per
 * event + open_item, every ledger line linked to its source partial_record —
 * never an orphaned capture, and the two approve surfaces can never drift on
 * whether they book.
 *
 * Lock-free: the CALLER owns `lockPeriodInTx` (each approve path takes the
 * period lock once, around this whole unit). `bookDocument` fails closed
 * (throws → the whole transaction rolls back, the held row stays held with the
 * reason) on any fact it cannot book safely.
 */
export async function captureAndBookIfInvoice(
  db: RowExecutor,
  ctx: OrgCtx,
  input: DocumentInput,
  responsibleUserId: string,
): Promise<CaptureAndBookResult> {
  const doc = await captureDocument(db, ctx, input)
  if (!INVOICE_TYPES.has(input.type)) return { doc }
  const booked = await bookDocument(db, ctx, {
    summaryRecordId: doc.summaryRecordId,
    responsibleUserId,
  })
  return { doc, postingIds: booked.postings.map((p) => p.postingId) }
}
