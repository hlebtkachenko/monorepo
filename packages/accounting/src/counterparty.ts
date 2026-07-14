/**
 * Supplier/customer → counterparty resolution (find-or-create), workspace-shared.
 *
 * The derive booker opens the saldokonto obligation against the event's
 * counterparty; the agent extracts the partner's identity (IČO / DIČ / name) from
 * the invoice but has no id to pass. resolveCounterparty maps that identity to the
 * one workspace-shared counterparty row, server-authoritatively, deduping by
 * IČO → DIČ → (name + country). It runs INSIDE createEvent (the single choke point
 * all apply/replay paths share), so every path — live, API approve, web approve —
 * links the same partner with zero drift, and re-approve is idempotent (a second
 * resolve MATCHES the row the first created).
 *
 * Correctness guards (a wrong-partner booking is a statutory saldokonto error):
 *   - the self-org row (self_of_organization_id) is OUR identity — never a match;
 *   - name-only matching runs only when the incoming party has neither IČO nor DIČ
 *     AND matches only a row that itself has neither, with equal country — a bare
 *     name never merges into a fully-identified company;
 *   - IČO and DIČ are independent (an individual's DIČ is CZ+rodné číslo, not an
 *     IČO) — never synthesised from one another;
 *   - a match back-fills only NULL columns (COALESCE) — never overwrites curated
 *     master data;
 *   - a miss inserts ON CONFLICT DO NOTHING against the (workspace_id, ico) /
 *     (workspace_id, tax_id) partial unique indexes (migration 0058), so two
 *     concurrent misses for the same new supplier converge on one row instead of
 *     splitting the vendor across two saldokonto partners.
 */

import { sql } from "drizzle-orm"
import { rows } from "./sql"
import type { RowExecutor } from "./sql"
import type { CounterpartyIdentity, OrgCtx } from "./types"

export type { CounterpartyIdentity }

interface Norm {
  ico: string | null
  taxId: string | null
  name: string | null
  country: string | null
}

/**
 * IČO is stored as EXACTLY 8 digits (DB CHECK `^[0-9]{8}$`), leading zeros
 * significant. Sources often drop the leading zeros ("1234567"), so left-pad to 8
 * — otherwise the INSERT would crash the CHECK at approve time, and an unpadded
 * incoming value would false-miss the zero-padded stored row (duplicate + crash).
 */
function normIco(raw: string): string | null {
  const d = raw.replace(/\D/g, "")
  if (!d) return null
  return d.length <= 8 ? d.padStart(8, "0") : d
}

function normalize(id: CounterpartyIdentity): Norm {
  return {
    ico: normIco(id.ico ?? ""),
    taxId: (id.dic ?? "").toUpperCase().replace(/\s+/g, "") || null,
    name: (id.name ?? "").normalize("NFC").trim().replace(/\s+/g, " ") || null,
    country: (id.countryCode ?? "").toUpperCase().trim() || null,
  }
}

/** self-org row is OUR identity — never a supplier/customer match. */
async function matchExisting(
  db: RowExecutor,
  ctx: OrgCtx,
  n: Norm,
): Promise<string | null> {
  if (n.ico) {
    const r = await rows<{ id: string }>(
      db,
      sql`SELECT id FROM counterparty
           WHERE workspace_id = ${ctx.workspaceId}::uuid
             AND self_of_organization_id IS NULL
             AND ico = ${n.ico}
           LIMIT 1`,
    )
    if (r[0]) return r[0].id
  }
  if (n.taxId) {
    const r = await rows<{ id: string }>(
      db,
      sql`SELECT id FROM counterparty
           WHERE workspace_id = ${ctx.workspaceId}::uuid
             AND self_of_organization_id IS NULL
             AND tax_id = ${n.taxId}
           LIMIT 1`,
    )
    if (r[0]) return r[0].id
  }
  // Name-only: ONLY when the incoming party carries no IČO and no DIČ, matching ONLY
  // a row that itself has neither, same country — a bare name never merges into a
  // fully-identified company.
  if (!n.ico && !n.taxId && n.name) {
    const r = await rows<{ id: string }>(
      db,
      sql`SELECT id FROM counterparty
           WHERE workspace_id = ${ctx.workspaceId}::uuid
             AND self_of_organization_id IS NULL
             AND ico IS NULL AND tax_id IS NULL
             AND lower(name) = lower(${n.name})
             AND country_code IS NOT DISTINCT FROM ${n.country}
           LIMIT 1`,
    )
    if (r[0]) return r[0].id
  }
  return null
}

async function backfill(db: RowExecutor, id: string, n: Norm): Promise<void> {
  // Fill NULLs only, and ONLY the non-unique display fields (name, country). The
  // identity keys (ico, tax_id) are set at INSERT when the entity is first seen
  // (Czech invoices carry both) — back-filling them onto an already-matched row
  // could hit the (workspace_id, ico)/(workspace_id, tax_id) partial unique index
  // when a sibling row already holds that value, and a unique violation inside the
  // approve tx poisons the whole transaction (no in-tx recovery). So never touch the
  // indexed keys here; a same-entity split that later needs re-keying is the far
  // rarer, non-fatal case.
  await rows(
    db,
    sql`UPDATE counterparty
           SET name = COALESCE(name, ${n.name}),
               country_code = COALESCE(country_code, ${n.country}),
               updated_at = now()
         WHERE id = ${id}::uuid`,
  )
}

export async function resolveCounterparty(
  db: RowExecutor,
  ctx: OrgCtx,
  identity: CounterpartyIdentity,
): Promise<string> {
  const n = normalize(identity)
  if (!n.ico && !n.taxId && !n.name) {
    throw new Error(
      "accounting: cannot resolve a counterparty with no IČO, DIČ, or name",
    )
  }

  const found = await matchExisting(db, ctx, n)
  if (found) {
    await backfill(db, found, n)
    return found
  }

  const inserted = await rows<{ id: string }>(
    db,
    sql`INSERT INTO counterparty (workspace_id, name, tax_id, country_code, ico)
        VALUES (${ctx.workspaceId}::uuid, ${n.name}, ${n.taxId}, ${n.country}, ${n.ico})
        ON CONFLICT DO NOTHING
        RETURNING id`,
  )
  if (inserted[0]) return inserted[0].id

  // A concurrent insert won the IČO/DIČ conflict — re-select the winner.
  const raced = await matchExisting(db, ctx, n)
  if (raced) return raced
  throw new Error(
    "accounting: counterparty upsert conflicted but no matching row resolved",
  )
}
