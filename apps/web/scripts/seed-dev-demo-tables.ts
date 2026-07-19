/**
 * Seed the dev org's demo tables for the Debug → Archetype Table reference pages.
 *
 * Runs AFTER `pnpm --filter @workspace/db db:seed` (which mints the `acme`
 * organization). Fills `demo_debug_normal_table_record` +
 * `demo_debug_pivot_table_record` with purpose-built demo rows so the
 * dev/allowlist-gated reference pages render real (queried) data on every fresh
 * dev server — NOT hardcoded fixtures, NOT real product data. The rows land ONLY
 * on the `acme` dev org; PROD stays empty (the CLI refuses a non-local
 * DATABASE_URL host below), so a page cloning these as a template needs no
 * demo-stripping.
 *
 * Idempotent: skips when the org already has demo rows, so a repeated Conductor
 * setup / re-run is a no-op.
 *
 * `seedDevDemoTables()` is exported for tests; the CLI entrypoint runs only when
 * executed directly and refuses any non-local DATABASE_URL host.
 */
/* eslint-disable turbo/no-undeclared-env-vars -- dev-only seed script, not a cached turbo task */
import { pathToFileURL } from "node:url"
import { sql } from "drizzle-orm"
import { executeRows, withAdminBypass, withOrganization } from "@workspace/db"
import {
  demo_debug_normal_table_record,
  demo_debug_pivot_table_record,
} from "@workspace/db/schema"

export interface SeedDevDemoTablesOptions {
  orgSlug?: string
  ownerEmail?: string
}

export type SeedDevDemoTablesResult =
  | { status: "no-org" }
  | { status: "exists" }
  | { status: "created"; normal: number; pivot: number }

const CATEGORIES = ["Services", "Goods", "Travel", "Software"]
const STATUSES = ["draft", "posted", "rejected"]
const PARTNERS = ["Alfa s.r.o.", "Beta a.s.", "Gama GmbH", "Delta Ltd"]
const MONTHS = [
  "2026-01",
  "2026-02",
  "2026-03",
  "2026-04",
  "2026-05",
  "2026-06",
]
const ROW_COUNT = 40

/** Deterministic cyclic pick — the modulo index is always in range. */
function pick<T>(arr: readonly T[], i: number): T {
  return arr[i % arr.length] as T
}

/**
 * Ensure the dev org identified by `orgSlug` has demo rows in both demo tables.
 * Returns `no-org` when the org is absent (db:seed hasn't run), `exists` when
 * demo rows already exist (idempotent no-op), or `created` with the row counts.
 */
export async function seedDevDemoTables(
  opts: SeedDevDemoTablesOptions = {},
): Promise<SeedDevDemoTablesResult> {
  const orgSlug = opts.orgSlug ?? process.env.SEED_ORG_SLUG ?? "acme"
  const ownerEmail =
    opts.ownerEmail ?? process.env.SEED_OWNER_EMAIL ?? "owner@example.com"

  return await withAdminBypass<SeedDevDemoTablesResult>(async (adminDb) => {
    const orgRows = await executeRows<{ id: string }>(
      adminDb,
      sql`SELECT id FROM organization WHERE slug = ${orgSlug} LIMIT 1`,
    )
    const org = orgRows[0]
    if (!org) return { status: "no-org" }

    // Probe BOTH tables so a split state (one seeded, one empty) still fills the
    // empty one. The inserts below are per-table conditional, so this never
    // duplicates rows in an already-seeded table.
    const [normalExisting] = await executeRows<{ id: string }>(
      adminDb,
      sql`SELECT id FROM demo_debug_normal_table_record
            WHERE organization_id = ${org.id}::uuid LIMIT 1`,
    )
    const [pivotExisting] = await executeRows<{ id: string }>(
      adminDb,
      sql`SELECT id FROM demo_debug_pivot_table_record
            WHERE organization_id = ${org.id}::uuid LIMIT 1`,
    )
    if (normalExisting && pivotExisting) return { status: "exists" }

    const ownerRows = await executeRows<{ id: string }>(
      adminDb,
      sql`SELECT id FROM app_user WHERE email = ${ownerEmail} LIMIT 1`,
    )
    const ownerUserId = ownerRows[0]?.id ?? null

    const normalRows = Array.from({ length: ROW_COUNT }, (_, i) => {
      const month = pick(MONTHS, i)
      const partner = pick(PARTNERS, i)
      const category = pick(CATEGORIES, i)
      return {
        organization_id: org.id,
        document: `DEMO-${String(i + 1).padStart(4, "0")}`,
        partner,
        status: pick(STATUSES, i),
        amount: (1000 + i * 137.5).toFixed(2),
        issued_on: `${month}-15`,
        note: `Demo record ${i + 1} — ${category} for ${partner}.`,
      }
    })

    const pivotRows = Array.from({ length: ROW_COUNT }, (_, i) => ({
      organization_id: org.id,
      category: pick(CATEGORIES, i),
      month: pick(MONTHS, i),
      status: pick(STATUSES, i),
      amount: (500 + (i % 12) * 220).toFixed(2),
    }))

    await withOrganization(
      org.id,
      ownerUserId,
      async (orgDb) => {
        if (!normalExisting)
          await orgDb.insert(demo_debug_normal_table_record).values(normalRows)
        if (!pivotExisting)
          await orgDb.insert(demo_debug_pivot_table_record).values(pivotRows)
      },
      adminDb,
    )

    return {
      status: "created",
      normal: normalExisting ? 0 : normalRows.length,
      pivot: pivotExisting ? 0 : pivotRows.length,
    }
  })
}

/** True when this module is the process entrypoint (run via tsx), not imported. */
function isDirectRun(): boolean {
  const entry = process.argv[1]
  return !!entry && import.meta.url === pathToFileURL(entry).href
}

if (isDirectRun()) {
  const orgSlug = process.env.SEED_ORG_SLUG ?? "acme"

  // Demo rows are dev-only — refuse any non-local DATABASE_URL host so this can
  // never seed a remote/prod DB (prod demo pages must render an empty state).
  const dbHost = (() => {
    try {
      return new URL(process.env.DATABASE_URL ?? "").hostname
    } catch {
      return ""
    }
  })()
  if (!new Set(["localhost", "127.0.0.1", "::1", "[::1]"]).has(dbHost)) {
    console.error(
      `Refusing to seed demo tables: DATABASE_URL host "${dbHost}" is not local.`,
    )
    process.exit(1)
  }

  const result = await seedDevDemoTables()
  if (result.status === "no-org") {
    console.log(
      `No organization with slug "${orgSlug}" — run db:seed first; skipping demo tables.`,
    )
  } else if (result.status === "exists") {
    console.log(`Demo tables already seeded for ${orgSlug} — skipping.`)
  } else {
    console.log(
      `Seeded ${result.normal} normal + ${result.pivot} pivot demo rows for ${orgSlug}.`,
    )
  }
}
