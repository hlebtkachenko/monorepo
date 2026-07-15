/**
 * post + (optionally) open its saldokonto obligation — the ONE unit both gated-write
 * posting paths (the live API createPosting + the held-write approve replay) run, so a
 * posting that should open a pohledávka/závazek does it identically everywhere.
 *
 * Until now only the invoice booker (`bookDocument`, PR #715) called `openObligation`, so
 * saldokonto populated ONLY for invoices — a contract obligation or an internal doklad that
 * posts a 311/321 leg left the saldo↔synthetic tie-out incomplete (the agent had no way to
 * open the item). `openObligation` was written to be "reused by every booker (invoice,
 * contract, internal doklad)"; this wires that reuse into `createAccountingPosting` via an
 * OPTIONAL directive, without a new primitive or a new table.
 *
 * The directive carries only what the server cannot derive — the saldo account NUMBER and the
 * obligation DIRECTION (plus optional due date / variable symbol). Everything statutory is
 * server-authoritative: the counterparty comes from the posting's event (NEVER the client),
 * the currency from the period, the account_id from the chart, and the AMOUNT is the exact
 * signed net movement `openObligation` reads off the posted lines. So the directive can pick
 * WHICH leg opens, but can neither fabricate the partner nor the amount. Fail-closed carries
 * through: a null-counterparty event throws, a net ≤ 0 (dobropis) opens nothing, and a
 * monetary/cash posting (no double-entry saldo leg) rejects the directive outright.
 */

import { sql } from "drizzle-orm"
import { one } from "../sql"
import type { RowExecutor } from "../sql"
import { resolveAccountIds } from "../accounts"
import { openObligation } from "../saldokonto"
import { post, type PostInput } from "./index"
import type { DoubleEntryInput, OpenItemDirection, OrgCtx } from "../types"

/** The optional "also open the saldokonto obligation this posting's saldo leg represents" directive. */
export interface ObligationDirective {
  /** saldokonto účet (311/321/…) BY NUMBER — one of the posting's line accounts. */
  saldoAccountNumber: string
  direction: OpenItemDirection
  /** Obligation issue date; defaults to the posting date. */
  issueDate?: string | null
  dueDate?: string | null
  variableSymbol?: string | null
}

export type PostWithObligationInput = PostInput & {
  obligation?: ObligationDirective | null
}

export interface PostWithObligationResult {
  postingId: string
  lineIds: string[]
  /** The opened open_item id, or null when there was no directive / net ≤ 0 (dobropis). */
  openItemId: string | null
}

/** Read the server-authoritative obligation context: the event's counterparty + the period currency. */
async function readObligationContext(
  db: RowExecutor,
  accountingEventId: string,
  periodId: string,
): Promise<{ counterpartyId: string | null; currencyCode: string }> {
  const event = await one<{ counterparty_id: string | null }>(
    db,
    sql`SELECT counterparty_id FROM accounting_event WHERE id = ${accountingEventId}::uuid`,
  )
  const period = await one<{ accounting_currency: string }>(
    db,
    sql`SELECT accounting_currency FROM accounting_period WHERE id = ${periodId}::uuid`,
  )
  return {
    counterpartyId: event.counterparty_id,
    currencyCode: period.accounting_currency,
  }
}

/**
 * Post, then — when the directive is present — open the obligation the posting's saldo leg
 * represents, in the SAME transaction (append-only ⇒ if opening throws, the posting rolls back
 * too, never an orphaned 311/321 leg). Returns the posting result plus the opened open_item id
 * (null when there is no directive, or the net movement was ≤ 0).
 */
export async function postWithObligation(
  db: RowExecutor,
  ctx: OrgCtx,
  input: PostWithObligationInput,
): Promise<PostWithObligationResult> {
  const posting = await post(db, ctx, {
    kind: input.kind,
    entry: input.entry,
  } as PostInput)
  if (!input.obligation) {
    return { ...posting, openItemId: null }
  }
  // A saldokonto obligation is a double-entry concept — `openObligation` sums
  // posting_double_entry_line, which a monetary/cash posting does not write.
  if (input.kind !== "double") {
    throw new Error(
      "accounting: openObligation is only valid for a double-entry posting (a monetary/cash posting has no saldo leg)",
    )
  }
  const entry = input.entry as DoubleEntryInput
  const { counterpartyId, currencyCode } = await readObligationContext(
    db,
    entry.accountingEventId,
    entry.periodId,
  )
  const accountIds = await resolveAccountIds(db, entry.periodId, [
    input.obligation.saldoAccountNumber,
  ])
  const saldoAccountId = accountIds.get(
    input.obligation.saldoAccountNumber,
  ) as string
  const openItemId = await openObligation(db, ctx, {
    counterpartyId,
    originPostingId: posting.postingId,
    saldoAccountNumber: input.obligation.saldoAccountNumber,
    saldoAccountId,
    direction: input.obligation.direction,
    currencyCode,
    issueDate: input.obligation.issueDate ?? entry.postingDate,
    dueDate: input.obligation.dueDate ?? null,
    variableSymbol: input.obligation.variableSymbol ?? null,
  })
  return { ...posting, openItemId }
}
