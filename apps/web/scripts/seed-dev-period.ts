/**
 * Scaffold the dev org's 2026 accounting period.
 *
 * Runs AFTER `pnpm --filter @workspace/db db:seed` (which mints the workspace +
 * the `acme` organization + owner memberships). It opens the first účetní období
 * for `acme` so `/o/acme` resolves to a real, bookable org on every fresh dev
 * server — no manual "create period" step.
 *
 * Uses the canonical org-provisioning path (`scaffoldAccountingPeriod`, the same
 * helper `POST /v1/accounting/periods` calls for an org that lacks its
 * accounting structure), so the period is minted together with its chart of
 * accounts + default number series (#579) rather than hand-rolled.
 *
 * Idempotent: skips when a period already overlaps the target fiscal year, so a
 * repeated Conductor setup / re-run is a no-op.
 *
 * `seedDevPeriod()` is exported for tests; the CLI entrypoint below runs only
 * when the file is executed directly, and refuses any non-local DATABASE_URL
 * host — this writes real accounting master-data and must never touch prod.
 */
/* eslint-disable turbo/no-undeclared-env-vars -- dev-only seed script, not a cached turbo task */
import { pathToFileURL } from "node:url"
import { sql } from "drizzle-orm"
import { executeRows, withAdminBypass, withOrganization } from "@workspace/db"
import {
  resolveOrgAccountingProfile,
  scaffoldAccountingPeriod,
} from "@workspace/org-provisioning"

export interface SeedDevPeriodOptions {
  orgSlug?: string
  ownerEmail?: string
  fiscalYear?: number
}

export type SeedDevPeriodResult =
  | { status: "no-org" }
  | { status: "exists"; periodId: string }
  | { status: "created"; periodId: string }

/**
 * Ensure the dev org identified by `orgSlug` has a `fiscalYear` accounting
 * period. Returns `no-org` when the org is absent (db:seed hasn't run),
 * `exists` when a period already covers the year (idempotent no-op), or
 * `created` with the new period id.
 */
export async function seedDevPeriod(
  opts: SeedDevPeriodOptions = {},
): Promise<SeedDevPeriodResult> {
  const orgSlug = opts.orgSlug ?? process.env.SEED_ORG_SLUG ?? "acme"
  const ownerEmail =
    opts.ownerEmail ?? process.env.SEED_OWNER_EMAIL ?? "owner@example.com"
  const fiscalYear =
    opts.fiscalYear ?? Number(process.env.SEED_ORG_FISCAL_YEAR ?? "2026")
  const periodStart = `${fiscalYear}-01-01`
  const periodEnd = `${fiscalYear}-12-31`

  return await withAdminBypass<SeedDevPeriodResult>(async (adminDb) => {
    const orgRows = await executeRows<{ id: string; workspace_id: string }>(
      adminDb,
      sql`SELECT id, workspace_id FROM organization WHERE slug = ${orgSlug} LIMIT 1`,
    )
    const org = orgRows[0]
    if (!org) return { status: "no-org" }

    // Idempotency: skip when a period already overlaps the target fiscal year
    // (the same predicate scaffoldAccountingPeriod's overlap guard uses).
    const existing = await executeRows<{ id: string }>(
      adminDb,
      sql`SELECT id FROM accounting_period
            WHERE organization_id = ${org.id}::uuid
              AND period_start <= ${periodEnd}::date
              AND period_end >= ${periodStart}::date
            LIMIT 1`,
    )
    if (existing[0]) return { status: "exists", periodId: existing[0].id }

    const ownerRows = await executeRows<{ id: string }>(
      adminDb,
      sql`SELECT id FROM app_user WHERE email = ${ownerEmail} LIMIT 1`,
    )
    const ownerUserId = ownerRows[0]?.id ?? null

    const { periodId } = await withOrganization(
      org.id,
      ownerUserId,
      async (orgDb) => {
        const profile = await resolveOrgAccountingProfile(orgDb, org.id)
        return await scaffoldAccountingPeriod(
          orgDb,
          {
            organizationId: org.id,
            workspaceId: org.workspace_id,
            regime: profile.regime,
            requiresChart: profile.requiresChart,
          },
          {
            periodStart,
            periodEnd,
            accountingCurrency: "CZK",
            status: "OPEN",
          },
        )
      },
      adminDb,
    )

    return { status: "created", periodId }
  })
}

/** True when this module is the process entrypoint (run via tsx), not imported. */
function isDirectRun(): boolean {
  const entry = process.argv[1]
  return !!entry && import.meta.url === pathToFileURL(entry).href
}

if (isDirectRun()) {
  const orgSlug = process.env.SEED_ORG_SLUG ?? "acme"
  const fiscalYear = Number(process.env.SEED_ORG_FISCAL_YEAR ?? "2026")

  // This mints real accounting data, so refuse to run against anything but a
  // local database — guards against seeding a remote/prod DB.
  const dbHost = (() => {
    try {
      return new URL(process.env.DATABASE_URL ?? "").hostname
    } catch {
      return ""
    }
  })()
  if (!new Set(["localhost", "127.0.0.1", "::1", "[::1]"]).has(dbHost)) {
    console.error(
      `Refusing to seed dev period: DATABASE_URL host "${dbHost}" is not local.`,
    )
    process.exit(1)
  }

  const result = await seedDevPeriod()
  if (result.status === "no-org") {
    console.log(
      `No organization with slug "${orgSlug}" — run db:seed first; skipping period.`,
    )
  } else if (result.status === "exists") {
    console.log(
      `accounting_period for ${fiscalYear} already exists (${result.periodId}) — skipping.`,
    )
  } else {
    console.log(
      `accounting_period ${fiscalYear}-01-01…${fiscalYear}-12-31 created (${result.periodId}) for ${orgSlug}.`,
    )
  }
}
