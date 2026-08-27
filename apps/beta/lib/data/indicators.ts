import "server-only"

import { and, desc, eq, inArray, sql } from "drizzle-orm"

import { betaDb, type BetaExecutor } from "@/db/client"
import { organization_indicator, type BetaIndicatorKind } from "@/db/schema"

import { recordOfficeActivity } from "./activity-log"
import { indicatorView, type IndicatorView } from "./projections"
import type { OrgScope, OwnerScope } from "./scope"

/**
 * organization_indicator — the office-stated figures Přehled's Obrat watch reads
 * (spec §2.1 item 4, migration 0020).
 *
 * ONE READ FOR THE CLIENT, ONE FOR THE OFFICE, AND TWO WRITES. The client
 * surface needs exactly one row (the newest reading of one kind); the office
 * surface needs the history, because a mis-typed `as_of` is the one mistake
 * that would otherwise shadow every correct reading forever — `latestIndicator`
 * orders by date, so a figure stated as of 2036 wins until somebody can delete
 * it.
 *
 * READS ARE FOR EVERY ROLE, like `loansForScope` and `assetsForScope` (spec §5:
 * a guest is an external VIEWER of client-visible data, not a blinded one). The
 * owner-only read is owner-only because of what it CARRIES — `note_internal` is
 * on `CLIENT_FORBIDDEN_COLUMNS` — not because the figure is a secret.
 *
 * WRITES ARE OWNER-ONLY (spec §3.3: client pages are read-only for every role).
 * The caller mints the handle with `requireOwner(await requireScope(orgSlug))`
 * as its first statement.
 *
 * IT COMPUTES NOTHING. There is no "obrat so far this year" here and there
 * cannot be: obrat is 12 consecutive months of taxable supplies with place of
 * plnění in tuzemsko, which is not a sum over any row this database holds
 * (§0.2). This module stores what the office stated and hands it back verbatim.
 */

/**
 * Which arm of the upsert below ran, answered by Postgres in the same round
 * trip.
 *
 * WHAT `xmax` IS. Every heap tuple carries a system column `xmax` holding the
 * transaction id that deleted or locked it; a freshly INSERTED tuple has never
 * been either, so its `xmax` is 0. `ON CONFLICT DO UPDATE` writes a NEW tuple
 * version for the conflicting row, and that version's `xmax` carries the id of
 * the transaction that took the row lock — non-zero. So in the `RETURNING` list
 * of an upsert, `xmax = 0` is true exactly for the rows this statement inserted
 * and false for the rows it updated. It is the standard way to distinguish the
 * two arms, and the only one that costs no extra statement.
 *
 * WHY NOT SELECT-THEN-BRANCH (what `ingestAccountBalanceMap` does). Two
 * statements have a race between them, on the very key the unique index would
 * then turn into a 23505 the caller has to decode back into "somebody else
 * inserted it first". One statement has no such window.
 *
 * BLAST RADIUS IF IT WERE EVER WRONG: a LABEL. The row, the figure and the
 * as-of date are identical either way; only the message the office reads
 * ("Záznam přidán" vs "Uloženo") and the agent summary's `created` / `updated`
 * counts depend on it. It cannot produce a wrong obrat, a lost reading, or a
 * duplicate row — those are all the unique index's job.
 *
 * THE ONE DOCUMENTED CAVEAT, and it is tested below: a row inserted and then
 * re-upserted inside the SAME transaction reports the second call as an update,
 * because by then the tuple genuinely has been locked by this transaction. That
 * is the truthful answer for "did this statement insert a new row" and it is the
 * only case where the count differs from a naive "how many items were new to the
 * payload" reading — which is exactly why `indicatorsUpsertSchema` refuses a
 * payload that states one `(kind, asOf)` twice, rather than letting the
 * ambiguity reach the summary at all.
 */
const INSERTED = sql<boolean>`(xmax = 0)`

const INDICATOR_COLUMNS = {
  id: organization_indicator.id,
  kind: organization_indicator.kind,
  amount: organization_indicator.amount,
  as_of: organization_indicator.as_of,
  updated_at: organization_indicator.updated_at,
}

/**
 * The newest reading of one kind, or `null` when the office has never stated
 * one.
 *
 * NEWEST BY `as_of`, NOT BY `created_at`. The office may enter May's figure
 * after June's (a late correction is normal at month-end), and the card is
 * answering "what is the most recent obrat we have been told", which is a
 * question about the FIGURE's date, not about when somebody typed it. The
 * unique index `(organization_id, kind, as_of)` makes that ordering total —
 * two rows can never share a date — so the `created_at` tiebreak below is a
 * floor, never the deciding comparison.
 */
export async function latestIndicator(
  scope: OrgScope,
  kind: BetaIndicatorKind,
): Promise<IndicatorView | null> {
  const [row] = await betaDb()
    .select(INDICATOR_COLUMNS)
    .from(organization_indicator)
    .where(
      and(
        eq(organization_indicator.organization_id, scope.organizationId),
        eq(organization_indicator.kind, kind),
      ),
    )
    .orderBy(
      desc(organization_indicator.as_of),
      desc(organization_indicator.created_at),
    )
    .limit(1)

  return row ? indicatorView(row) : null
}

/**
 * Every reading the office has stated, newest first — the Zadávání dat table.
 *
 * `noteInternal` is attached HERE rather than in `projections.ts`, and only on
 * this owner-gated read, exactly as `partnersForOwner` does with
 * `partner.note_internal`: the column is on `CLIENT_FORBIDDEN_COLUMNS`, so the
 * shared projection must not know how to carry it.
 */
export async function indicatorsForOwner(
  scope: OwnerScope,
): Promise<(IndicatorView & { readonly noteInternal: string })[]> {
  const rows = await betaDb()
    .select({
      ...INDICATOR_COLUMNS,
      note_internal: organization_indicator.note_internal,
    })
    .from(organization_indicator)
    .where(eq(organization_indicator.organization_id, scope.organizationId))
    .orderBy(
      desc(organization_indicator.as_of),
      desc(organization_indicator.created_at),
    )

  return rows.map((row) => ({
    ...indicatorView(row),
    noteInternal: row.note_internal ?? "",
  }))
}

/**
 * WHAT THE PORTAL IS ALLOWED TO WRITE. `amount` arrives as a STRING and is
 * stored verbatim (spec §0.7) — this file never parses, adds or rounds one.
 */
export type IndicatorWriteInput = {
  readonly kind: BetaIndicatorKind
  readonly amount: string
  readonly asOf: string
  readonly noteInternal?: string | null
}

/**
 * State a reading, replacing the one already stated for that kind AND that date.
 *
 * MATCHED ON `(kind, as_of)`, which is the same key the unique index enforces.
 * Re-stating 30. 6. 2026 is a CORRECTION of that reading, never a second
 * contradictory row next to it — a table holding two obraty for one date would
 * make "the latest figure" depend on insertion order, and the card would show
 * whichever won the race. Stating a different date is a new reading and inserts.
 *
 * `ON CONFLICT` rather than select-then-branch, for the reason the ingestion
 * layer needs and the form gets for free: two writers racing on the same
 * (kind, as_of) resolve into one row instead of one of them raising 23505.
 *
 * Returns which of the two happened, so the caller can say "uloženo" or
 * "přidáno" truthfully rather than guessing.
 */
export async function upsertIndicator(
  scope: OwnerScope,
  input: IndicatorWriteInput,
  executor: BetaExecutor = betaDb(),
): Promise<{ id: string; action: "created" | "updated" }> {
  const [row] = await executor
    .insert(organization_indicator)
    .values({
      organization_id: scope.organizationId,
      kind: input.kind,
      amount: input.amount,
      as_of: input.asOf,
      note_internal: input.noteInternal ?? null,
    })
    .onConflictDoUpdate({
      target: [
        organization_indicator.organization_id,
        organization_indicator.kind,
        organization_indicator.as_of,
      ],
      set: {
        amount: input.amount,
        note_internal: input.noteInternal ?? null,
      },
    })
    .returning({ id: organization_indicator.id, inserted: INSERTED })

  if (!row) throw new Error("organization_indicator upsert returned no row")
  return { id: row.id, action: row.inserted ? "created" : "updated" }
}

/**
 * Delete readings outright.
 *
 * OFFERED, unlike on most tables here, because of what `latestIndicator` does:
 * it picks the row with the newest `as_of`, so a figure entered as of 2036
 * instead of 2026 shadows every correct reading until it is gone. Correcting the
 * AMOUNT is an upsert; correcting the DATE is a delete plus a re-entry, and
 * there is no history worth keeping in a typo.
 *
 * The WHERE clause carries `organization_id` even though `id` is a primary key:
 * without it, an id leaked or guessed from anywhere would let a holder of ANY
 * scope delete ANY book's figure, and this database has no RLS behind the seam
 * to catch it.
 */
export async function deleteIndicators(
  scope: OwnerScope,
  ids: readonly string[],
  executor: BetaExecutor = betaDb(),
): Promise<{ id: string; kind: BetaIndicatorKind; asOf: string }[]> {
  if (ids.length === 0) return []

  // RETURNING the identity, not just a count: the office activity row names
  // which reading was removed, and the row is gone by the time anyone could
  // read it back.
  const deleted = await executor
    .delete(organization_indicator)
    .where(
      and(
        eq(organization_indicator.organization_id, scope.organizationId),
        inArray(organization_indicator.id, [...ids]),
      ),
    )
    .returning({
      id: organization_indicator.id,
      kind: organization_indicator.kind,
      as_of: organization_indicator.as_of,
    })

  return deleted.map((row) => ({ id: row.id, kind: row.kind, asOf: row.as_of }))
}

// ---------------------------------------------------------------------------
// The office's own doors — the write PLUS its audit row, in one transaction
// ---------------------------------------------------------------------------

/**
 * WHY THESE TWO WRAPPERS EXIST. The agent path records every write it makes in
 * `activity_log` (`ingestIndicators` → `recordAgentActivity`). Obrat can enter
 * this book through BOTH doors, and a fact whose audit trail depends on which
 * door was used is not an audit trail — it is a gap that only shows up when
 * somebody asks who stated the figure that told a client they had a registration
 * duty. So the office writes log too, and the two rows differ only in
 * `actor_kind`.
 *
 * THE LOG SHARES THE WRITE'S TRANSACTION, which is the whole reason these are
 * data-layer functions rather than two calls in the Server Action: a Server
 * Action cannot open one (it may not import `db/client` — see
 * `db-client-fence.boundary.test.ts`), and a log row written outside the write's
 * transaction would survive its rollback and claim something happened that did
 * not.
 *
 * THE SUMMARY NAMES THE READING, NOT THE FIGURE. `kind` and `as_of` identify
 * which row moved; the amount itself lives in `organization_indicator` and the
 * activity log deliberately does not become a second copy of the accounting
 * payload (`activity-log.ts`'s own rule).
 */
export async function upsertIndicatorAsOffice(
  scope: OwnerScope,
  input: IndicatorWriteInput,
): Promise<{ id: string; action: "created" | "updated" }> {
  return betaDb().transaction(async (tx) => {
    const written = await upsertIndicator(scope, input, tx)

    await recordOfficeActivity(tx, scope, {
      action: "indicator.upsert",
      entityKind: "organization_indicator",
      entityId: written.id,
      summary: {
        kind: input.kind,
        asOf: input.asOf,
        action: written.action,
      },
    })

    return written
  })
}

/**
 * Delete one reading and record it. Returns whether a row actually went — a
 * delete that matched nothing writes no log row, because nothing happened.
 */
export async function deleteIndicatorAsOffice(
  scope: OwnerScope,
  indicatorId: string,
): Promise<boolean> {
  return betaDb().transaction(async (tx) => {
    const [deleted] = await deleteIndicators(scope, [indicatorId], tx)
    if (!deleted) return false

    await recordOfficeActivity(tx, scope, {
      action: "indicator.delete",
      entityKind: "organization_indicator",
      entityId: deleted.id,
      summary: { kind: deleted.kind, asOf: deleted.asOf },
    })

    return true
  })
}
