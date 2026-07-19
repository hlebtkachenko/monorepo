import "server-only"

import { asc } from "drizzle-orm"
import { withOrgReadonly } from "@workspace/db"
import {
  demo_debug_normal_table_record,
  demo_debug_pivot_table_record,
} from "@workspace/db/schema"

/**
 * Reads for the Debug → Archetype Table reference pages. The rows come from
 * dedicated `demo_*` tables seeded ONLY on the dev org (see
 * `apps/web/scripts/seed-dev-demo-tables.ts`), so this is a REAL query — never a
 * hardcoded fixture — and PROD renders an empty state (no demo rows there).
 *
 * Runs under `withOrgReadonly` (binds `app.organization_id` + `app.user_id`) so
 * FORCE RLS is the tenant boundary — no manual `organization_id` filter. The
 * caller passes the org + user resolved from the authenticated membership.
 *
 * `amount` is surfaced as a display-grade `number` (the demo tables do no
 * accounting arithmetic, and the Table/Pivot render numbers) — deliberately NOT
 * `Money<Currency>`. A real money field must never be a native number; do not
 * copy this shape into a domain page.
 */

/** One demo row as the Normal Table + its row Inspector render it. */
export interface DebugNormalRow {
  id: string
  document: string
  partner: string
  status: string
  amount: number
  issuedOn: string
  note: string
}

/** One demo observation the Pivot Table folds (category × month → Σ amount). */
export interface DebugPivotRow {
  id: string
  category: string
  month: string
  status: string
  amount: number
}

export async function getDebugNormalTableRows(input: {
  organizationId: string
  userId: string | null
}): Promise<DebugNormalRow[]> {
  const rows = await withOrgReadonly(input.organizationId, input.userId, (db) =>
    db
      .select({
        id: demo_debug_normal_table_record.id,
        document: demo_debug_normal_table_record.document,
        partner: demo_debug_normal_table_record.partner,
        status: demo_debug_normal_table_record.status,
        amount: demo_debug_normal_table_record.amount,
        issued_on: demo_debug_normal_table_record.issued_on,
        note: demo_debug_normal_table_record.note,
      })
      .from(demo_debug_normal_table_record)
      .orderBy(asc(demo_debug_normal_table_record.document)),
  )
  return rows.map((row) => ({
    id: row.id,
    document: row.document,
    partner: row.partner,
    status: row.status,
    amount: Number(row.amount),
    issuedOn: row.issued_on,
    note: row.note,
  }))
}

export async function getDebugPivotTableRows(input: {
  organizationId: string
  userId: string | null
}): Promise<DebugPivotRow[]> {
  const rows = await withOrgReadonly(input.organizationId, input.userId, (db) =>
    db
      .select({
        id: demo_debug_pivot_table_record.id,
        category: demo_debug_pivot_table_record.category,
        month: demo_debug_pivot_table_record.month,
        status: demo_debug_pivot_table_record.status,
        amount: demo_debug_pivot_table_record.amount,
      })
      .from(demo_debug_pivot_table_record)
      .orderBy(
        asc(demo_debug_pivot_table_record.category),
        asc(demo_debug_pivot_table_record.month),
      ),
  )
  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    month: row.month,
    status: row.status,
    amount: Number(row.amount),
  }))
}
