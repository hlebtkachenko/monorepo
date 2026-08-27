import "server-only"

import { and, desc, eq, sql } from "drizzle-orm"

import { betaDb, type BetaExecutor } from "@/db/client"
import { organization_indicator, type BetaIndicatorKind } from "@/db/schema"

import { indicatorView, type IndicatorView } from "./projections"
import type { OrgScope, OwnerScope } from "./scope"

/**
 * organization_indicator — the office-stated figures Přehled's Obrat watch reads
 * (spec §2.1 item 4, migration 0020).
 *
 * ONE READ FOR THE CLIENT, ONE FOR THE OFFICE, AND ONE WRITE. The client
 * surface needs exactly one row (the newest reading of one kind); the office
 * surface needs the history, because `latestIndicator` orders by date and a
 * mis-typed `as_of` would otherwise shadow every correct reading with no way to
 * see that it had.
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
