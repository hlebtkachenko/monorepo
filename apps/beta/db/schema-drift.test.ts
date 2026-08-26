/**
 * The Drizzle DSL under `db/schema/` is a hand-written mirror of the SQL in
 * `db/migrations/` — `drizzle-kit generate` is forbidden repo-wide (ADR-0009).
 * A hand-written mirror drifts silently: a column added to the migration and
 * forgotten in the DSL only surfaces as a runtime "column does not exist" on the
 * page that reads it.
 *
 * This test closes that gap by comparing every declared table and enum against
 * the real migrated database. Both directions are covered: a table in the SQL
 * with no DSL counterpart fails just as loudly as the reverse.
 */
import { getTableConfig } from "drizzle-orm/pg-core"
import type { PgTable } from "drizzle-orm/pg-core"
import postgres from "postgres"
import { afterAll, describe, expect, it } from "vitest"
import {
  app_user,
  asset,
  asset_event,
  auth_account,
  auth_session,
  auth_verification,
  betaAssetCategory,
  betaAssetEventKind,
  betaAssetStatus,
  betaDocumentStatus,
  betaDocumentType,
  betaFilingFamily,
  betaFilingKind,
  betaFilingStatus,
  betaImportDataset,
  betaImportSource,
  betaImportStatus,
  betaObligationGroup,
  betaOrgRole,
  betaPeriodKind,
  betaSetupTokenPurpose,
  betaStatementKind,
  betaVatRegime,
  document,
  filing,
  import_batch,
  liability,
  organization,
  organization_membership,
  reporting_period,
  statement_line,
  trial_balance_line,
  two_factor,
  user_setup_token,
} from "./schema"
import { sharedDatabaseUrl } from "../tests/scratch-db"

const sql = postgres(sharedDatabaseUrl(), { max: 1, onnotice: () => {} })

afterAll(async () => {
  await sql.end({ timeout: 5 })
})

const tables: PgTable[] = [
  app_user,
  asset,
  asset_event,
  auth_account,
  auth_session,
  auth_verification,
  document,
  filing,
  import_batch,
  liability,
  organization,
  organization_membership,
  reporting_period,
  statement_line,
  trial_balance_line,
  two_factor,
  user_setup_token,
]

describe("drizzle schema mirrors the migrations", () => {
  it("declares exactly the tables the migrations create", async () => {
    const actual = await sql<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_type = 'BASE TABLE'
         AND table_name <> '_beta_migrations'
       ORDER BY table_name
    `
    expect(tables.map((t) => getTableConfig(t).name).sort()).toEqual(
      actual.map((t) => t.table_name),
    )
  })

  it.each(tables.map((table) => [getTableConfig(table).name, table] as const))(
    "%s columns match the database exactly",
    async (name, table) => {
      const declared = getTableConfig(table).columns
      const actual = await sql<{ column_name: string; is_nullable: string }[]>`
        SELECT column_name, is_nullable
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = ${name}
         ORDER BY column_name
      `

      expect(actual.length).toBeGreaterThan(0)
      expect(declared.map((c) => c.name).sort()).toEqual(
        actual.map((c) => c.column_name),
      )

      const nullableInDb = new Map(
        actual.map((c) => [c.column_name, c.is_nullable === "YES"]),
      )
      for (const column of declared) {
        expect
          .soft(
            nullableInDb.get(column.name),
            `${name}.${column.name} nullability`,
          )
          .toBe(!column.notNull)
      }
    },
  )

  it("declares every enum with the same labels, in the same order", async () => {
    const actual = await sql<{ enum_name: string; labels: string[] }[]>`
      SELECT t.typname AS enum_name,
             array_agg(e.enumlabel ORDER BY e.enumsortorder)::text[] AS labels
        FROM pg_type t
        JOIN pg_enum e ON e.enumtypid = t.oid
       GROUP BY t.typname
       ORDER BY t.typname
    `

    expect(
      Object.fromEntries(actual.map((r) => [r.enum_name, r.labels])),
    ).toEqual({
      beta_asset_category: [...betaAssetCategory.enumValues],
      beta_asset_event_kind: [...betaAssetEventKind.enumValues],
      beta_asset_status: [...betaAssetStatus.enumValues],
      beta_document_status: [...betaDocumentStatus.enumValues],
      beta_document_type: [...betaDocumentType.enumValues],
      beta_filing_family: [...betaFilingFamily.enumValues],
      beta_filing_kind: [...betaFilingKind.enumValues],
      beta_filing_status: [...betaFilingStatus.enumValues],
      beta_import_dataset: [...betaImportDataset.enumValues],
      beta_import_source: [...betaImportSource.enumValues],
      beta_import_status: [...betaImportStatus.enumValues],
      beta_obligation_group: [...betaObligationGroup.enumValues],
      beta_org_role: [...betaOrgRole.enumValues],
      beta_period_kind: [...betaPeriodKind.enumValues],
      beta_setup_token_purpose: [...betaSetupTokenPurpose.enumValues],
      beta_statement_kind: [...betaStatementKind.enumValues],
      beta_vat_regime: [...betaVatRegime.enumValues],
    })
  })

  /**
   * The DSL cannot express "this column is computed by the database", beyond
   * excluding it from the insert type — so the one thing that would silently
   * turn a generated column into an ordinary nullable one (dropping
   * `GENERATED ALWAYS AS ... STORED` from a future migration while the DSL keeps
   * `.generatedAlwaysAs`) is invisible to the column comparison above. Both
   * halves are asserted here: the database agrees these two are generated, and
   * the DSL agrees they are not writable.
   */
  it("keeps reporting_period's derived boundaries generated on both sides", async () => {
    const actual = await sql<{ column_name: string; is_generated: string }[]>`
      SELECT column_name, is_generated
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'reporting_period'
         AND column_name IN ('starts_on', 'ends_on')
       ORDER BY column_name
    `
    expect(actual).toEqual([
      { column_name: "ends_on", is_generated: "ALWAYS" },
      { column_name: "starts_on", is_generated: "ALWAYS" },
    ])

    const generated = getTableConfig(reporting_period)
      .columns.filter((column) => column.generated !== undefined)
      .map((column) => column.name)
      .sort()
    expect(generated).toEqual(["ends_on", "starts_on"])
  })
})
