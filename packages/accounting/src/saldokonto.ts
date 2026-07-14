/**
 * Saldokonto (open items) — párování pohledávek a závazků (§16, ČÚS 001).
 *
 * Each unpaid receivable/payable is an open_item, opened by the invoice posting.
 * It is PERENNIAL (an invoice issued in one period is paid in another) and so
 * references the saldokonto account BY NUMBER (D8), not a per-period account_id.
 * settled_amount is maintained ONLY by the DB settlement trigger (the app may
 * INSERT/SELECT open_item but never UPDATE it — the tamper-lock); a match is
 * corrected by a NEW negative-amount match, never an edit (append-only).
 *
 * Amounts are in the účetní měna so Σ per partner ties to the synthetic
 * closing_balance. For a foreign-currency obligation, `amount` on a settlement
 * reduces the open item at the ORIGINAL (booking) rate while the actual cash
 * value rides on amount_in_accounting_currency at the settlement rate — their
 * difference is the realized kurzový rozdíl (see fx/engine.ts).
 */

import { sql } from "drizzle-orm"
import { one, rows } from "./sql"
import type { RowExecutor } from "./sql"
import type { Decimal, OpenItemDirection, OrgCtx } from "./types"

export interface OpenItemInput {
  counterpartyId: string
  /** The invoice posting that opened the obligation. */
  originPostingId: string
  /** saldokonto účet (311/321/…) BY NUMBER (D8). */
  accountNumber: string
  direction: OpenItemDirection
  /** Full obligation in účetní měna. */
  originalAmount: Decimal
  currencyCode: string
  issueDate: string
  dueDate?: string | null
  variableSymbol?: string | null
}

/** Open one obligation (pohledávka / závazek). */
export async function openItem(
  db: RowExecutor,
  ctx: OrgCtx,
  input: OpenItemInput,
): Promise<string> {
  const r = await one<{ id: string }>(
    db,
    sql`INSERT INTO open_item
          (organization_id, workspace_id, counterparty_id, origin_posting_id, account_number, direction,
           variable_symbol, original_amount, currency_code, issue_date, due_date)
        VALUES
          (${ctx.organizationId}::uuid, ${ctx.workspaceId}::uuid, ${input.counterpartyId}::uuid, ${input.originPostingId}::uuid,
           ${input.accountNumber}, ${input.direction}, ${input.variableSymbol ?? null}, ${input.originalAmount},
           ${input.currencyCode}, ${input.issueDate}::date, ${input.dueDate ?? null})
        RETURNING id`,
  )
  return r.id
}

export interface OpenObligationInput {
  /** THEIR side; an invoice/obligation must have one — null fails closed. */
  counterpartyId: string | null
  /** The posting whose saldokonto leg opened the obligation. */
  originPostingId: string
  /** saldokonto účet (311/321/…) BY NUMBER — stored on the open item. */
  saldoAccountNumber: string
  /** account_id of {@link saldoAccountNumber} in the posting's period, to sum its lines. */
  saldoAccountId: string
  direction: OpenItemDirection
  currencyCode: string
  issueDate: string
  dueDate?: string | null
  variableSymbol?: string | null
}

/**
 * Open the saldokonto obligation (pohledávka / závazek) a posting's counterparty
 * leg represents — the one production caller of {@link openItem}, reused by every
 * booker (invoice, contract, internal doklad).
 *
 * The amount is the SIGNED net movement on the saldo account read straight from the
 * posted double-entry lines (exact numeric, never re-derived): the increase side is
 * CREDIT for a PAYABLE (321) / DEBIT for a RECEIVABLE (311). A net ≤ 0 opens nothing
 * and returns null — a dobropis REDUCES an obligation (and `open_item.original_amount`
 * must be > 0), so párování of a standalone credit note against the original is left
 * to the settlement path (deferred). A positive movement with NO counterparty fails
 * closed (throws): a 311/321 leg with no open item silently breaks the saldo↔synthetic
 * tie-out, and open_item is append-only (uncorrectable) — so hold, never guess.
 */
export async function openObligation(
  db: RowExecutor,
  ctx: OrgCtx,
  input: OpenObligationInput,
): Promise<string | null> {
  const increaseSide = input.direction === "PAYABLE" ? "CREDIT" : "DEBIT"
  // Sign decision stays in Postgres numeric (exact, no float): `opens` is the
  // net > 0 test, `net` is the účetní-měna amount for openItem. A net ≤ 0 (a
  // dobropis reduces) opens nothing.
  const { net, opens } = await one<{ net: Decimal; opens: boolean }>(
    db,
    sql`SELECT movement::text AS net, (movement > 0) AS opens
          FROM (
            SELECT COALESCE(
              SUM(CASE WHEN side = ${increaseSide} THEN amount ELSE -amount END),
            0) AS movement
              FROM posting_double_entry_line
             WHERE posting_id = ${input.originPostingId}::uuid
               AND account_id = ${input.saldoAccountId}::uuid
          ) m`,
  )
  if (!opens) {
    return null
  }
  if (input.counterpartyId === null) {
    throw new Error(
      `accounting: posting ${input.originPostingId} opens a ${input.direction} on ${input.saldoAccountNumber} but its event has no counterparty — the saldokonto obligation needs a partner; capture the counterparty before booking`,
    )
  }
  return openItem(db, ctx, {
    counterpartyId: input.counterpartyId,
    originPostingId: input.originPostingId,
    accountNumber: input.saldoAccountNumber,
    direction: input.direction,
    originalAmount: net,
    currencyCode: input.currencyCode,
    issueDate: input.issueDate,
    dueDate: input.dueDate ?? null,
    variableSymbol: input.variableSymbol ?? null,
  })
}

export interface SettleInput {
  openItemId: string
  /** The payment posting (bank/cash). */
  settlingPostingId: string
  /** Applied amount in účetní měna (reduces the open item); negative = rozpárování. */
  amount: Decimal
  settlementDate: string
  /** ČNB rate at settlement (NULL = účetní-currency settlement, no FX). */
  settlementFxRate?: Decimal | null
  /** Actual cash value in účetní měna at the settlement rate (foreign case). */
  amountInAccountingCurrency?: Decimal | null
}

/**
 * Record one settlement (úhrada / párování). The DB trigger moves
 * open_item.settled_amount; this only appends the match. A negative amount
 * reverses a prior match (rozpárování).
 */
export async function settleOpenItem(
  db: RowExecutor,
  ctx: OrgCtx,
  input: SettleInput,
): Promise<string> {
  const r = await one<{ id: string }>(
    db,
    sql`INSERT INTO open_item_settlement
          (organization_id, open_item_id, settling_posting_id, amount, settlement_date, settlement_fx_rate, amount_in_accounting_currency)
        VALUES
          (${ctx.organizationId}::uuid, ${input.openItemId}::uuid, ${input.settlingPostingId}::uuid, ${input.amount},
           ${input.settlementDate}::date, ${input.settlementFxRate ?? null}, ${input.amountInAccountingCurrency ?? null})
        RETURNING id`,
  )
  return r.id
}

export interface OpenItemRow {
  id: string
  counterparty_id: string
  account_number: string
  direction: OpenItemDirection
  variable_symbol: string | null
  original_amount: Decimal
  settled_amount: Decimal
  remaining_amount: Decimal
  is_settled: boolean
  currency_code: string
  issue_date: string
  due_date: string | null
}

/** All open items for one counterparty (one indexed read). */
export function openItemsForCounterparty(
  db: RowExecutor,
  counterpartyId: string,
): Promise<OpenItemRow[]> {
  return rows<OpenItemRow>(
    db,
    sql`SELECT id, counterparty_id, account_number, direction, variable_symbol,
               original_amount, settled_amount, remaining_amount, is_settled,
               currency_code, issue_date, due_date
          FROM open_item
         WHERE counterparty_id = ${counterpartyId}::uuid
         ORDER BY issue_date, id`,
  )
}

/** Unsettled obligations, optionally past a due date (overdue / pohledávky po splatnosti). */
export function unsettledOpenItems(
  db: RowExecutor,
  opts: { dueBefore?: string; direction?: OpenItemDirection } = {},
): Promise<OpenItemRow[]> {
  const dueFilter = opts.dueBefore
    ? sql`AND due_date IS NOT NULL AND due_date < ${opts.dueBefore}::date`
    : sql``
  const dirFilter = opts.direction
    ? sql`AND direction = ${opts.direction}`
    : sql``
  return rows<OpenItemRow>(
    db,
    sql`SELECT id, counterparty_id, account_number, direction, variable_symbol,
               original_amount, settled_amount, remaining_amount, is_settled,
               currency_code, issue_date, due_date
          FROM open_item
         WHERE is_settled = false ${dueFilter} ${dirFilter}
         ORDER BY due_date NULLS LAST, id`,
  )
}

export interface SaldoPerPartnerRow {
  counterparty_id: string
  account_number: string
  direction: OpenItemDirection
  open_total: Decimal
}

/**
 * Saldokonto gross view: remaining balance per (partner, account, direction).
 * The párování engine (auto-matching) is deferred; this is the statutorily
 * sufficient per-partner evidence (§13/§31). Σ per account ties to the
 * synthetic closing_balance.
 */
export function saldoPerPartner(
  db: RowExecutor,
): Promise<SaldoPerPartnerRow[]> {
  return rows<SaldoPerPartnerRow>(
    db,
    sql`SELECT counterparty_id, account_number, direction,
               SUM(remaining_amount) AS open_total
          FROM open_item
         WHERE is_settled = false
         GROUP BY counterparty_id, account_number, direction
        HAVING SUM(remaining_amount) <> 0
         ORDER BY account_number, counterparty_id`,
  )
}
