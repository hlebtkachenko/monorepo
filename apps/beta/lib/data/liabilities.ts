import "server-only"

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm"

import { betaDb } from "@/db/client"
import { liability, type BetaObligationGroup } from "@/db/schema"

import { liabilityView, type LiabilityView } from "./projections"
import type { OrgScope, OwnerScope } from "./scope"

/**
 * The manual liability residue (spec §2.4, §3.3, §4).
 *
 * READS ARE FOR EVERY ROLE, exactly as `filings.ts` reads are: §5 makes guest an
 * external VIEWER of the same client-visible data, and Dluhy a platby is
 * client-visible. What a guest may not do is CHANGE anything.
 *
 * WRITES TAKE AN `OwnerScope`, NOT AN `OrgScope` + `assertOwner` (§3.3: client
 * pages are read-only for every role, Zadávání dat is the only editing home).
 * The brand is minted only by `requireOwner`, which is the role check, so
 * "this write is owner-only" is a COMPILE error to get wrong rather than a
 * convention every new function has to remember — a write added here later
 * cannot accidentally accept a guest's handle, because a guest never holds one.
 * `filings.ts` still uses the older `assertOwner` form; converting it is a
 * separate, mechanical change and not this PR's concern.
 *
 * DLUHY A PLATBY DOES NOT READ THIS MODULE. It reads `obligations.ts`, which
 * unions this table with the filing registry (and, from PR 28, the imported
 * saldokonto) into one row shape. This module is what ZADÁVÁNÍ DAT reads and
 * writes — the editing surface, which is the only place that has any business
 * knowing a liability is a liability.
 *
 * NO ARITHMETIC ANYWHERE IN THIS FILE. `amount` arrives as a string, is stored
 * verbatim, and comes back as a string; `numeric(14,2)` rejects a malformed one
 * at the boundary, which is where validation belongs (spec §0.2 / §0.7).
 */

/**
 * Derived in SQL against `CURRENT_DATE`, per spec §2.4 ("Po splatnosti
 * derived"). A paid liability is never overdue, however late the payment was —
 * the row is closed. Identical in shape to `IS_OVERDUE` in `filings.ts`, and
 * deliberately not shared: the two tables' columns are different columns, and a
 * helper taking two column references to save one line is the abstraction that
 * makes the next reader open a third file.
 */
const IS_OVERDUE = sql<boolean>`(${liability.paid_at} IS NULL AND ${liability.due_on} < CURRENT_DATE)`

const LIABILITY_COLUMNS = {
  id: liability.id,
  creditor_group: liability.creditor_group,
  label: liability.label,
  amount: liability.amount,
  due_on: liability.due_on,
  paid_at: liability.paid_at,
  variable_symbol: liability.variable_symbol,
  note_client: liability.note_client,
  updated_at: liability.updated_at,
  overdue: IS_OVERDUE,
  // note_internal is deliberately not selected. It is office-only (§3.1) and on
  // CLIENT_FORBIDDEN_COLUMNS; not selecting it means no projection here can leak
  // it even by accident.
}

export type LiabilityFilter = {
  /**
   * Include rows the office has already marked paid. Default `false`.
   *
   * The editing surface asks for them (an accountant correcting a mis-keyed
   * payment has to be able to find the row again); nothing else does, because a
   * paid liability is not a debt and Dluhy a platby is a list of debts.
   */
  readonly includePaid?: boolean
}

/** The organization's manual liabilities, earliest deadline first. */
export async function liabilitiesForScope(
  scope: OrgScope,
  filter: LiabilityFilter = {},
): Promise<LiabilityView[]> {
  const rows = await betaDb()
    .select(LIABILITY_COLUMNS)
    .from(liability)
    .where(
      and(
        eq(liability.organization_id, scope.organizationId),
        filter.includePaid ? undefined : isNull(liability.paid_at),
      ),
    )
    .orderBy(asc(liability.due_on), asc(liability.id))

  return rows.map(liabilityView)
}

// ---------------------------------------------------------------------------
// Office writes — Zadávání dat (spec §3.3)
// ---------------------------------------------------------------------------

/**
 * WHAT THE PORTAL IS ALLOWED TO WRITE.
 *
 * `amount` arrives as a STRING and is stored verbatim: beta never computes an
 * accounting number (spec §0.2), so there is no place in this file where a money
 * value is parsed, added, rounded or reformatted.
 *
 * `group` defaults at the DATABASE (`DEFAULT 'ostatni'`), not here — §2.4's
 * ordinary case for the residue — and the database also refuses `dodavatele`
 * (`liability_group_is_residue`), so a caller cannot type a supplier payable
 * next to its imported twin however it reaches this function.
 */
export type LiabilityWriteInput = {
  readonly group?: BetaObligationGroup
  /** The §2.4 "titul". Non-blank (DB CHECK). */
  readonly label: string
  /** `numeric(14,2)` as a string. Strictly positive (DB CHECK). */
  readonly amount: string
  readonly dueOn: string
  readonly paidAt?: Date | null
  readonly variableSymbol?: string | null
  readonly noteClient?: string | null
  readonly noteInternal?: string | null
}

/** Create a manual liability. */
export async function createLiability(
  owner: OwnerScope,
  input: LiabilityWriteInput,
): Promise<{ id: string }> {
  const [row] = await betaDb()
    .insert(liability)
    .values({
      organization_id: owner.organizationId,
      ...(input.group ? { creditor_group: input.group } : {}),
      label: input.label,
      amount: input.amount,
      due_on: input.dueOn,
      paid_at: input.paidAt ?? null,
      variable_symbol: input.variableSymbol ?? null,
      note_client: input.noteClient ?? null,
      note_internal: input.noteInternal ?? null,
    })
    .returning({ id: liability.id })

  if (!row) throw new Error("liability insert returned no row")
  return row
}

/**
 * The fields Zadávání dat may change.
 *
 * ALL OF THEM, unlike `FilingPatch` — and the asymmetry is the point. A filing's
 * `kind` and `period_id` are its identity: re-pointing either silently rewrites
 * history for every surface that already showed it, so a mistyped filing is
 * deleted and re-entered. A manual liability has no identity of that sort. It is
 * a free-text row the office typed, it is stamped with no period, and nothing
 * else in the database points at it, so correcting a typo IS an edit.
 */
export type LiabilityPatch = Partial<LiabilityWriteInput>

/**
 * Edit a liability. Returns whether a row matched, so the caller can refuse
 * rather than report a successful save of nothing.
 *
 * The WHERE clause carries `organization_id` even though `id` is a primary key.
 * That is not belt-and-braces: without it, an id leaked or guessed from anywhere
 * would let a holder of ANY scope edit ANY liability, and this database has no
 * RLS behind the seam to catch it.
 */
export async function updateLiability(
  owner: OwnerScope,
  liabilityId: string,
  patch: LiabilityPatch,
): Promise<boolean> {
  // `"key" in patch` rather than `patch.key !== undefined`: an explicit
  // `{ paidAt: null }` is "mark this unpaid again", which is a different
  // instruction from "leave paid_at alone" and has to survive the round trip.
  const values = {
    ...("group" in patch ? { creditor_group: patch.group } : {}),
    ...("label" in patch ? { label: patch.label } : {}),
    ...("amount" in patch ? { amount: patch.amount } : {}),
    ...("dueOn" in patch ? { due_on: patch.dueOn } : {}),
    ...("paidAt" in patch ? { paid_at: patch.paidAt ?? null } : {}),
    ...("variableSymbol" in patch
      ? { variable_symbol: patch.variableSymbol ?? null }
      : {}),
    ...("noteClient" in patch ? { note_client: patch.noteClient ?? null } : {}),
    ...("noteInternal" in patch
      ? { note_internal: patch.noteInternal ?? null }
      : {}),
  }

  if (Object.keys(values).length === 0) return true

  const updated = await betaDb()
    .update(liability)
    .set(values)
    .where(
      and(
        eq(liability.id, liabilityId),
        eq(liability.organization_id, owner.organizationId),
      ),
    )
    .returning({ id: liability.id })

  return updated.length > 0
}

/**
 * Delete liabilities by id, within the scope's own organization.
 *
 * A HARD delete, unlike `document`'s soft one. A document is evidence the client
 * uploaded and the office may have to produce again; a manual liability is a row
 * the office typed and nothing references it — keeping a tombstone would only
 * give the read model something to remember to exclude.
 */
export async function deleteLiabilities(
  owner: OwnerScope,
  liabilityIds: readonly string[],
): Promise<number> {
  if (liabilityIds.length === 0) return 0

  const deleted = await betaDb()
    .delete(liability)
    .where(
      and(
        eq(liability.organization_id, owner.organizationId),
        inArray(liability.id, [...liabilityIds]),
      ),
    )
    .returning({ id: liability.id })

  return deleted.length
}
