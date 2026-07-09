/**
 * v2 accounting — behavioral-invariants harness.
 *
 * A faithful port of the prior hand-run psql validation batteries
 * (.context/accounting/enforcement-{seed,test}.sql + open-item-test.sql)
 * into Vitest, run against the FULL migrated schema (migrations 0001-0034,
 * so the v2 accounting tables + the 0034 enforcement layer are live).
 *
 * Seeding strategy (matches rls-cross-organization.test.ts):
 *   - `adminClient()` is the testcontainer superuser (postgres, BYPASSRLS). It
 *     SEEDS all rows. The org-scoped accounting tables are FORCE RLS, but a
 *     superuser bypasses that, so seeding does not require GUCs. We still set
 *     `app.organization_id` / `app.workspace_id` on the admin connection where
 *     it makes assertions cleaner / mirrors the SQL seed.
 *   - `userClient()` connects as `app_user` (RLS-subject). Every isolation
 *     assertion runs on a user connection with the org/workspace GUCs set via
 *     `set_config(...)` inside an explicit transaction (so the GUC is scoped).
 *
 * Seed shape (one workspace W, two orgs A + B, DOUBLE_ENTRY, 2025 OPEN period):
 *   chart 211/321/518/701/751, one balanced posting MD 518 / D 321 = 1000.
 *   A parallel 311/221 saldokonto leg + a SINGLE_ENTRY 2024 period for cash.
 *
 * The container is disposable; fixed hex-only UUIDs are used throughout so a
 * re-run inside a reused container is deterministic. No cleanup is performed
 * (append-only tables block TRUNCATE/DELETE by design and the container is
 * thrown away on teardown).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import postgres from "postgres"
import { adminClient } from "./fixtures.js"

// ---------------------------------------------------------------------------
// Fixed identifiers (hex-only, matching the SQL-seed legend). uuidv7 is never
// used so the seed is byte-for-byte reproducible.
// ---------------------------------------------------------------------------
const WORKSPACE = "00000000-0000-0000-0000-0000000000a0"
const ORG_A = "00000000-0000-0000-0000-0000000000a1"
const ORG_B = "00000000-0000-0000-0000-0000000000b1"
const USER = "00000000-0000-0000-0000-0000000000f1"

// org A — double-entry 2025
const PERIOD_A = "00000000-0000-0000-0000-0000000000c1"
const CHART_A = "00000000-0000-0000-0000-0000000000d1"
const ACC_211 = "00000000-0000-0000-0000-000000000211"
const ACC_321 = "00000000-0000-0000-0000-000000000321"
const ACC_518 = "00000000-0000-0000-0000-000000000518"
const ACC_701 = "00000000-0000-0000-0000-000000000701"
const ACC_751 = "00000000-0000-0000-0000-000000000751"
const ACC_518_CHILD = "00000000-0000-0000-0000-000000005181"
const SERIES_EV = "00000000-0000-0000-0000-0000000000e1"
const SERIES_FP = "00000000-0000-0000-0000-0000000000e2"
const EVENT_A = "00000000-0000-0000-0000-000000000e10"
const DOC_A = "00000000-0000-0000-0000-000000000d10"
const INDIV_A = "00000000-0000-0000-0000-000000000110"
const PARTIAL_A = "00000000-0000-0000-0000-000000000210"
const POSTING_A = "00000000-0000-0000-0000-000000000900"

// org B — double-entry 2025 (parallel, so isolation tests have a B-side)
const PERIOD_B = "00000000-0000-0000-0000-0000000000c2"

// org A — single-entry 2024 (for the cash-min-line invariant)
const PERIOD_A_SE = "00000000-0000-0000-0000-0000000000c3"
const EVENT_A_SE = "00000000-0000-0000-0000-000000003e10"
const DOC_A_SE = "00000000-0000-0000-0000-000000003d10"

// saldokonto leg (org A): a 311/221 invoice + payment posting under PERIOD_A
const ACC_311 = "00000000-0000-0000-0000-000000000311"
const ACC_221 = "00000000-0000-0000-0000-000000000221"
const CP_VENDOR = "00000000-0000-0000-0000-0000000000fc"
const INV_EVENT = "00000000-0000-0000-0000-0000000000e9"
const INV_DOC = "00000000-0000-0000-0000-0000000000d3"
const INV_INDIV = "00000000-0000-0000-0000-0000000000d4"
const INV_POSTING = "00000000-0000-0000-0000-000000000931"
const PAY_EVENT = "00000000-0000-0000-0000-0000000000ea"
const PAY_DOC = "00000000-0000-0000-0000-0000000000d5"
const PAY_INDIV = "00000000-0000-0000-0000-0000000000d6"
const PAY_POSTING = "00000000-0000-0000-0000-000000000932"
const OPEN_ITEM = "00000000-0000-0000-0000-00000000a001"
// org B's own open_item (for the cross-tenant composite-FK test)
const ORG_B_POSTING = "00000000-0000-0000-0000-00000000b901"
const ORG_B_OPEN_ITEM = "00000000-0000-0000-0000-00000000b0a1"
const ORG_B_ACC_311 = "00000000-0000-0000-0000-00000000b311"
const ORG_B_ACC_221 = "00000000-0000-0000-0000-00000000b221"
const ORG_B_CHART = "00000000-0000-0000-0000-0000000000bd"
const ORG_B_SERIES_EV = "00000000-0000-0000-0000-00000000be01"
const ORG_B_SERIES_FP = "00000000-0000-0000-0000-00000000be02"
const ORG_B_EVENT = "00000000-0000-0000-0000-00000000bea1"
const ORG_B_DOC = "00000000-0000-0000-0000-00000000bd01"
const ORG_B_INDIV = "00000000-0000-0000-0000-00000000bd02"
const CP_VENDOR_B = "00000000-0000-0000-0000-0000000000fd"

let admin: postgres.Sql
let user: postgres.Sql

/** Run a block on the user connection with org/workspace GUCs set (tx-scoped). */
async function asOrg<T>(
  orgId: string,
  fn: (tx: postgres.Sql) => Promise<T>,
  workspaceId: string = WORKSPACE,
): Promise<T> {
  return user.begin(async (tx) => {
    await tx.unsafe(
      `SELECT set_config('app.workspace_id', '${workspaceId}', true)`,
    )
    await tx.unsafe(
      `SELECT set_config('app.organization_id', '${orgId}', true)`,
    )
    return fn(tx as unknown as postgres.Sql)
  })
}

/**
 * Set an accounting_period's status from the admin connection.
 *
 * The reopen gate (app_block_period_reopen) blocks CLOSED->OPEN for any role
 * NOT in ('app_owner','app_admin'). Our admin connects as the testcontainer
 * superuser `postgres`, which is NOT in that allowlist — so a naive
 * `UPDATE ... SET status='OPEN'` from the admin connection would itself be
 * rejected. We therefore run the status change under `SET LOCAL ROLE app_admin`
 * (the privileged reopen path the production service uses), which both
 * satisfies the reopen gate and keeps BYPASSRLS so the row resolves.
 */
async function setPeriodStatus(
  periodId: string,
  status: "OPEN" | "CLOSED",
): Promise<void> {
  await admin.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL ROLE app_admin`)
    await tx.unsafe(
      `UPDATE accounting_period SET status = '${status}' WHERE id = '${periodId}'::uuid`,
    )
  })
}

beforeAll(async () => {
  admin = adminClient()
  const userUrl = process.env["DATABASE_URL"]
  if (!userUrl) throw new Error("DATABASE_URL not set — did globalSetup run?")
  user = postgres(userUrl, { prepare: false, max: 1, onnotice: () => {} })

  // -- platform identities -----------------------------------------------------
  await admin.unsafe(`
    INSERT INTO app_user (id, email)
    VALUES ('${USER}', 'user@office.test')
    ON CONFLICT (id) DO NOTHING
  `)
  await admin.unsafe(`
    INSERT INTO workspace (id, created_by_user_id, display_name)
    VALUES ('${WORKSPACE}', '${USER}', 'Accounting Office')
    ON CONFLICT (id) DO NOTHING
  `)
  // Real platform organization: legal_name + person_kind (+ legal_subject_kind
  // for legal_entity) are required; person_type is GENERATED; organization_id
  // is set to id by the platform trigger.
  await admin.unsafe(`
    INSERT INTO organization (id, workspace_id, slug, legal_name, person_kind, legal_subject_kind)
    VALUES
      ('${ORG_A}', '${WORKSPACE}', 'org-a', 'Org A s.r.o.', 'legal_entity', 'for_profit'),
      ('${ORG_B}', '${WORKSPACE}', 'org-b', 'Org B s.r.o.', 'legal_entity', 'for_profit')
    ON CONFLICT (id) DO NOTHING
  `)

  // -- counterparties (workspace-shared vendors) ------------------------------
  await admin.unsafe(`
    INSERT INTO counterparty (id, workspace_id) VALUES
      ('${CP_VENDOR}', '${WORKSPACE}'),
      ('${CP_VENDOR_B}', '${WORKSPACE}')
    ON CONFLICT (id) DO NOTHING
  `)

  // The admin (postgres superuser) bypasses RLS, but the read-model maintenance
  // trigger reads back the period via the session; set the GUCs anyway so every
  // seed write resolves exactly as the production app would.
  await admin.unsafe(
    `SELECT set_config('app.workspace_id', '${WORKSPACE}', false)`,
  )
  await admin.unsafe(
    `SELECT set_config('app.organization_id', '${ORG_A}', false)`,
  )

  // -- org A: 2025 DOUBLE_ENTRY period + chart ---------------------------------
  await admin.unsafe(`
    INSERT INTO accounting_period (id, organization_id, period_start, period_end, status, regime_code, accounting_currency)
    VALUES ('${PERIOD_A}', '${ORG_A}', '2025-01-01', '2025-12-31', 'OPEN', 'DOUBLE_ENTRY', 'CZK')
    ON CONFLICT (id) DO NOTHING
  `)
  await admin.unsafe(`
    INSERT INTO chart_of_accounts (id, organization_id, period_id)
    VALUES ('${CHART_A}', '${ORG_A}', '${PERIOD_A}')
    ON CONFLICT (id) DO NOTHING
  `)
  await admin.unsafe(`
    INSERT INTO account (id, organization_id, chart_id, period_id, number, name, nature, normal_balance, tracks_open_items) VALUES
      ('${ACC_211}', '${ORG_A}', '${CHART_A}', '${PERIOD_A}', '211', 'Pokladna', 'ASSET', 'DEBIT', false),
      ('${ACC_321}', '${ORG_A}', '${CHART_A}', '${PERIOD_A}', '321', 'Dodavatelé', 'LIABILITY', 'CREDIT', true),
      ('${ACC_518}', '${ORG_A}', '${CHART_A}', '${PERIOD_A}', '518', 'Ostatní služby', 'EXPENSE', 'DEBIT', false),
      ('${ACC_701}', '${ORG_A}', '${CHART_A}', '${PERIOD_A}', '701', 'Počáteční účet rozvažný', 'CLOSING', NULL, false),
      ('${ACC_751}', '${ORG_A}', '${CHART_A}', '${PERIOD_A}', '751', 'Podrozvahová evidence', 'OFF_BALANCE', NULL, false),
      ('${ACC_311}', '${ORG_A}', '${CHART_A}', '${PERIOD_A}', '311', 'Odběratelé', 'ASSET', 'DEBIT', true),
      ('${ACC_221}', '${ORG_A}', '${CHART_A}', '${PERIOD_A}', '221', 'Bankovní účet', 'ASSET', 'DEBIT', false)
    ON CONFLICT (id) DO NOTHING
  `)
  await admin.unsafe(`
    INSERT INTO number_series (id, organization_id, entity_type, code, pattern) VALUES
      ('${SERIES_EV}', '${ORG_A}', 'EVENT', 'EV', 'EV{NNNN}'),
      ('${SERIES_FP}', '${ORG_A}', 'DOCUMENT', 'FP', 'FP{NNNN}')
    ON CONFLICT (id) DO NOTHING
  `)

  // -- org A: the canonical balanced posting (MD 518 / D 321 = 1000) ----------
  await admin.unsafe(`
    INSERT INTO accounting_event (id, organization_id, workspace_id, period_id, number_series_id, sequence_number, designation, description, occurred_at, responsible_user_id)
    VALUES ('${EVENT_A}', '${ORG_A}', '${WORKSPACE}', '${PERIOD_A}', '${SERIES_EV}', 1, 'EV0001', 'Nákup služby', '2025-03-10', '${USER}')
    ON CONFLICT (id) DO NOTHING
  `)
  await admin.unsafe(`
    INSERT INTO summary_record (id, organization_id, workspace_id, period_id, number_series_id, sequence_number, designation, type, issued_at)
    VALUES ('${DOC_A}', '${ORG_A}', '${WORKSPACE}', '${PERIOD_A}', '${SERIES_FP}', 1, 'FP0001', 'RECEIVED_INVOICE', '2025-03-10')
    ON CONFLICT (id) DO NOTHING
  `)
  await admin.unsafe(`
    INSERT INTO individual_record (id, organization_id, summary_record_id, accounting_event_id)
    VALUES ('${INDIV_A}', '${ORG_A}', '${DOC_A}', '${EVENT_A}')
    ON CONFLICT (id) DO NOTHING
  `)
  await admin.unsafe(`
    INSERT INTO partial_record (id, organization_id, individual_record_id, base_amount, vat_rate, vat_mode, vat_amount, currency_code, base_in_accounting_currency, vat_in_accounting_currency)
    VALUES ('${PARTIAL_A}', '${ORG_A}', '${INDIV_A}', 1000, 21, 'STANDARD', 210, 'CZK', 1000, 210)
    ON CONFLICT (id) DO NOTHING
  `)
  // posting + its 2 balanced lines in one tx so the DEFERRABLE R4 trigger is
  // satisfied at COMMIT.
  await admin.begin(async (tx) => {
    await tx.unsafe(
      `SELECT set_config('app.workspace_id', '${WORKSPACE}', true)`,
    )
    await tx.unsafe(
      `SELECT set_config('app.organization_id', '${ORG_A}', true)`,
    )
    await tx.unsafe(`
      INSERT INTO posting (id, organization_id, period_id, regime_code, summary_record_id, accounting_event_id, posting_date, posting_kind, responsible_user_id, posted_at)
      VALUES ('${POSTING_A}', '${ORG_A}', '${PERIOD_A}', 'DOUBLE_ENTRY', '${DOC_A}', '${EVENT_A}', '2025-03-10', 'SIMPLE', '${USER}', now())
      ON CONFLICT (id) DO NOTHING
    `)
    await tx.unsafe(`
      INSERT INTO posting_double_entry_line (id, organization_id, posting_id, period_id, regime_code, account_id, partial_record_id, side, amount) VALUES
        ('00000000-0000-0000-0000-000000000901', '${ORG_A}', '${POSTING_A}', '${PERIOD_A}', 'DOUBLE_ENTRY', '${ACC_518}', '${PARTIAL_A}', 'DEBIT', 1000),
        ('00000000-0000-0000-0000-000000000902', '${ORG_A}', '${POSTING_A}', '${PERIOD_A}', 'DOUBLE_ENTRY', '${ACC_321}', '${PARTIAL_A}', 'CREDIT', 1000)
      ON CONFLICT (id) DO NOTHING
    `)
  })

  // -- org A: §16 analytical child 518.001 under synthetic 518 ----------------
  await admin.unsafe(`
    INSERT INTO account (id, organization_id, chart_id, period_id, parent_id, number, name, nature, normal_balance) VALUES
      ('${ACC_518_CHILD}', '${ORG_A}', '${CHART_A}', '${PERIOD_A}', '${ACC_518}', '518.001', 'Telefon', 'EXPENSE', 'DEBIT')
    ON CONFLICT (id) DO NOTHING
  `)

  // -- org A: saldokonto invoice posting (MD 311 / D 221 = 1000) --------------
  await admin.unsafe(`
    INSERT INTO accounting_event (id, organization_id, workspace_id, period_id, number_series_id, sequence_number, designation, description, occurred_at, responsible_user_id)
    VALUES ('${INV_EVENT}', '${ORG_A}', '${WORKSPACE}', '${PERIOD_A}', '${SERIES_EV}', 2, 'EV0002', 'Vydaná faktura', '2025-03-10', '${USER}')
    ON CONFLICT (id) DO NOTHING
  `)
  await admin.unsafe(`
    INSERT INTO summary_record (id, organization_id, workspace_id, period_id, number_series_id, sequence_number, designation, type, issued_at)
    VALUES ('${INV_DOC}', '${ORG_A}', '${WORKSPACE}', '${PERIOD_A}', '${SERIES_FP}', 2, 'FV0001', 'ISSUED_INVOICE', '2025-03-10')
    ON CONFLICT (id) DO NOTHING
  `)
  await admin.unsafe(`
    INSERT INTO individual_record (id, organization_id, summary_record_id, accounting_event_id)
    VALUES ('${INV_INDIV}', '${ORG_A}', '${INV_DOC}', '${INV_EVENT}')
    ON CONFLICT (id) DO NOTHING
  `)
  await admin.begin(async (tx) => {
    await tx.unsafe(
      `SELECT set_config('app.organization_id', '${ORG_A}', true)`,
    )
    await tx.unsafe(`
      INSERT INTO posting (id, organization_id, period_id, regime_code, summary_record_id, accounting_event_id, posting_date, posting_kind, responsible_user_id, posted_at)
      VALUES ('${INV_POSTING}', '${ORG_A}', '${PERIOD_A}', 'DOUBLE_ENTRY', '${INV_DOC}', '${INV_EVENT}', '2025-03-10', 'SIMPLE', '${USER}', now())
      ON CONFLICT (id) DO NOTHING
    `)
    await tx.unsafe(`
      INSERT INTO posting_double_entry_line (id, organization_id, posting_id, period_id, regime_code, account_id, side, amount) VALUES
        ('00000000-0000-0000-0000-0000000009a1', '${ORG_A}', '${INV_POSTING}', '${PERIOD_A}', 'DOUBLE_ENTRY', '${ACC_311}', 'DEBIT', 1000),
        ('00000000-0000-0000-0000-0000000009a2', '${ORG_A}', '${INV_POSTING}', '${PERIOD_A}', 'DOUBLE_ENTRY', '${ACC_221}', 'CREDIT', 1000)
      ON CONFLICT (id) DO NOTHING
    `)
  })

  // -- org A: saldokonto payment posting (MD 221 / D 311 = 1000) --------------
  await admin.unsafe(`
    INSERT INTO accounting_event (id, organization_id, workspace_id, period_id, number_series_id, sequence_number, designation, description, occurred_at, responsible_user_id)
    VALUES ('${PAY_EVENT}', '${ORG_A}', '${WORKSPACE}', '${PERIOD_A}', '${SERIES_EV}', 3, 'EV0003', 'Příjem platby', '2025-04-01', '${USER}')
    ON CONFLICT (id) DO NOTHING
  `)
  await admin.unsafe(`
    INSERT INTO summary_record (id, organization_id, workspace_id, period_id, number_series_id, sequence_number, designation, type, issued_at)
    VALUES ('${PAY_DOC}', '${ORG_A}', '${WORKSPACE}', '${PERIOD_A}', '${SERIES_FP}', 3, 'BV0001', 'BANK_STATEMENT', '2025-04-01')
    ON CONFLICT (id) DO NOTHING
  `)
  await admin.unsafe(`
    INSERT INTO individual_record (id, organization_id, summary_record_id, accounting_event_id)
    VALUES ('${PAY_INDIV}', '${ORG_A}', '${PAY_DOC}', '${PAY_EVENT}')
    ON CONFLICT (id) DO NOTHING
  `)
  await admin.begin(async (tx) => {
    await tx.unsafe(
      `SELECT set_config('app.organization_id', '${ORG_A}', true)`,
    )
    await tx.unsafe(`
      INSERT INTO posting (id, organization_id, period_id, regime_code, summary_record_id, accounting_event_id, posting_date, posting_kind, responsible_user_id, posted_at)
      VALUES ('${PAY_POSTING}', '${ORG_A}', '${PERIOD_A}', 'DOUBLE_ENTRY', '${PAY_DOC}', '${PAY_EVENT}', '2025-04-01', 'SIMPLE', '${USER}', now())
      ON CONFLICT (id) DO NOTHING
    `)
    await tx.unsafe(`
      INSERT INTO posting_double_entry_line (id, organization_id, posting_id, period_id, regime_code, account_id, side, amount) VALUES
        ('00000000-0000-0000-0000-0000000009b1', '${ORG_A}', '${PAY_POSTING}', '${PERIOD_A}', 'DOUBLE_ENTRY', '${ACC_221}', 'DEBIT', 1000),
        ('00000000-0000-0000-0000-0000000009b2', '${ORG_A}', '${PAY_POSTING}', '${PERIOD_A}', 'DOUBLE_ENTRY', '${ACC_311}', 'CREDIT', 1000)
      ON CONFLICT (id) DO NOTHING
    `)
  })

  // -- org A: SINGLE_ENTRY 2024 period (for the cash-min-line invariant) ------
  await admin.unsafe(`
    INSERT INTO accounting_period (id, organization_id, period_start, period_end, status, regime_code, accounting_currency)
    VALUES ('${PERIOD_A_SE}', '${ORG_A}', '2024-01-01', '2024-12-31', 'OPEN', 'SINGLE_ENTRY', 'CZK')
    ON CONFLICT (id) DO NOTHING
  `)
  await admin.unsafe(`
    INSERT INTO accounting_event (id, organization_id, workspace_id, period_id, number_series_id, sequence_number, designation, description, occurred_at, responsible_user_id)
    VALUES ('${EVENT_A_SE}', '${ORG_A}', '${WORKSPACE}', '${PERIOD_A_SE}', '${SERIES_EV}', 4, 'EV0004', 'Příjem hotovost', '2024-06-01', '${USER}')
    ON CONFLICT (id) DO NOTHING
  `)
  await admin.unsafe(`
    INSERT INTO summary_record (id, organization_id, workspace_id, period_id, number_series_id, sequence_number, designation, type, issued_at)
    VALUES ('${DOC_A_SE}', '${ORG_A}', '${WORKSPACE}', '${PERIOD_A_SE}', '${SERIES_FP}', 4, 'PD0001', 'CASH_DOCUMENT', '2024-06-01')
    ON CONFLICT (id) DO NOTHING
  `)

  // -- org B: a parallel 2025 DOUBLE_ENTRY period + a posting + own open_item --
  await admin.begin(async (tx) => {
    await tx.unsafe(
      `SELECT set_config('app.organization_id', '${ORG_B}', true)`,
    )
    await tx.unsafe(`
      INSERT INTO accounting_period (id, organization_id, period_start, period_end, status, regime_code, accounting_currency)
      VALUES ('${PERIOD_B}', '${ORG_B}', '2025-01-01', '2025-12-31', 'OPEN', 'DOUBLE_ENTRY', 'CZK')
      ON CONFLICT (id) DO NOTHING
    `)
    await tx.unsafe(`
      INSERT INTO chart_of_accounts (id, organization_id, period_id)
      VALUES ('${ORG_B_CHART}', '${ORG_B}', '${PERIOD_B}')
      ON CONFLICT (id) DO NOTHING
    `)
    await tx.unsafe(`
      INSERT INTO account (id, organization_id, chart_id, period_id, number, name, nature, normal_balance) VALUES
        ('${ORG_B_ACC_311}', '${ORG_B}', '${ORG_B_CHART}', '${PERIOD_B}', '311', 'Odběratelé', 'ASSET', 'DEBIT'),
        ('${ORG_B_ACC_221}', '${ORG_B}', '${ORG_B_CHART}', '${PERIOD_B}', '221', 'Bankovní účet', 'ASSET', 'DEBIT')
      ON CONFLICT (id) DO NOTHING
    `)
    await tx.unsafe(`
      INSERT INTO number_series (id, organization_id, entity_type, code, pattern) VALUES
        ('${ORG_B_SERIES_EV}', '${ORG_B}', 'EVENT', 'EV', 'EV{NNNN}'),
        ('${ORG_B_SERIES_FP}', '${ORG_B}', 'DOCUMENT', 'FV', 'FV{NNNN}')
      ON CONFLICT (id) DO NOTHING
    `)
    await tx.unsafe(`
      INSERT INTO accounting_event (id, organization_id, workspace_id, period_id, number_series_id, sequence_number, designation, description, occurred_at, responsible_user_id)
      VALUES ('${ORG_B_EVENT}', '${ORG_B}', '${WORKSPACE}', '${PERIOD_B}', '${ORG_B_SERIES_EV}', 1, 'EV0001', 'Faktura org B', '2025-03-15', '${USER}')
      ON CONFLICT (id) DO NOTHING
    `)
    await tx.unsafe(`
      INSERT INTO summary_record (id, organization_id, workspace_id, period_id, number_series_id, sequence_number, designation, type, issued_at)
      VALUES ('${ORG_B_DOC}', '${ORG_B}', '${WORKSPACE}', '${PERIOD_B}', '${ORG_B_SERIES_FP}', 1, 'FV0001', 'ISSUED_INVOICE', '2025-03-15')
      ON CONFLICT (id) DO NOTHING
    `)
    await tx.unsafe(`
      INSERT INTO individual_record (id, organization_id, summary_record_id, accounting_event_id)
      VALUES ('${ORG_B_INDIV}', '${ORG_B}', '${ORG_B_DOC}', '${ORG_B_EVENT}')
      ON CONFLICT (id) DO NOTHING
    `)
    await tx.unsafe(`
      INSERT INTO posting (id, organization_id, period_id, regime_code, summary_record_id, accounting_event_id, posting_date, posting_kind, responsible_user_id, posted_at)
      VALUES ('${ORG_B_POSTING}', '${ORG_B}', '${PERIOD_B}', 'DOUBLE_ENTRY', '${ORG_B_DOC}', '${ORG_B_EVENT}', '2025-03-15', 'SIMPLE', '${USER}', now())
      ON CONFLICT (id) DO NOTHING
    `)
    await tx.unsafe(`
      INSERT INTO posting_double_entry_line (id, organization_id, posting_id, period_id, regime_code, account_id, side, amount) VALUES
        ('00000000-0000-0000-0000-00000000b9a1', '${ORG_B}', '${ORG_B_POSTING}', '${PERIOD_B}', 'DOUBLE_ENTRY', '${ORG_B_ACC_311}', 'DEBIT', 500),
        ('00000000-0000-0000-0000-00000000b9a2', '${ORG_B}', '${ORG_B_POSTING}', '${PERIOD_B}', 'DOUBLE_ENTRY', '${ORG_B_ACC_221}', 'CREDIT', 500)
      ON CONFLICT (id) DO NOTHING
    `)
    await tx.unsafe(`
      INSERT INTO open_item (id, organization_id, workspace_id, counterparty_id, origin_posting_id, account_number, direction, original_amount, currency_code, issue_date, due_date)
      VALUES ('${ORG_B_OPEN_ITEM}', '${ORG_B}', '${WORKSPACE}', '${CP_VENDOR_B}', '${ORG_B_POSTING}', '311', 'RECEIVABLE', 500, 'CZK', '2025-03-15', '2025-04-15')
      ON CONFLICT (id) DO NOTHING
    `)
  })
})

afterAll(async () => {
  // Disposable container: no cleanup. Append-only tables block TRUNCATE/DELETE
  // by design; the container is stopped in global-setup teardown.
  await admin.end({ timeout: 5 })
  await user.end({ timeout: 5 })
})

// ===========================================================================
// RLS / tenancy
// ===========================================================================
describe("RLS / tenancy isolation", () => {
  it("(1) org B session cannot SELECT org A's posting or balance rows", async () => {
    const { postings, balances } = await asOrg(ORG_B, async (tx) => {
      const postings = await tx.unsafe<Array<{ id: string }>>(
        `SELECT id FROM posting WHERE id = '${POSTING_A}'::uuid`,
      )
      const balances = await tx.unsafe<Array<{ account_id: string }>>(
        `SELECT account_id FROM account_period_balance WHERE account_id = '${ACC_518}'::uuid`,
      )
      return { postings, balances }
    })
    expect(postings).toHaveLength(0)
    expect(balances).toHaveLength(0)
  })

  it("(1b) org A session DOES see its own posting + balance rows", async () => {
    const { postings, balances } = await asOrg(ORG_A, async (tx) => {
      const postings = await tx.unsafe<Array<{ id: string }>>(
        `SELECT id FROM posting WHERE id = '${POSTING_A}'::uuid`,
      )
      const balances = await tx.unsafe<Array<{ account_id: string }>>(
        `SELECT account_id FROM account_period_balance WHERE account_id = '${ACC_518}'::uuid`,
      )
      return { postings, balances }
    })
    expect(postings.map((r) => r.id)).toContain(POSTING_A)
    expect(balances.map((r) => r.account_id)).toContain(ACC_518)
  })

  it("(1c) empty org GUC yields zero posting rows (NULLIF guard, no cast error)", async () => {
    const rows = await user.begin(async (tx) => {
      await tx.unsafe(`SELECT set_config('app.organization_id', '', true)`)
      return tx.unsafe<Array<{ id: string }>>(`SELECT id FROM posting`)
    })
    expect(rows).toHaveLength(0)
  })

  it("(2) app_user cannot forge a cross-tenant posting into org A while scoped to org B (RLS WITH CHECK)", async () => {
    // app_user scoped to org B; try to plant a posting carrying org A's id.
    // The forged child references org A's period/doc/event (composite FKs would
    // also reject), but RLS WITH CHECK rejects first on organization_id.
    await expect(
      asOrg(ORG_B, async (tx) => {
        await tx.unsafe(`
          INSERT INTO posting (id, organization_id, period_id, regime_code, summary_record_id, accounting_event_id, posting_date, posting_kind, responsible_user_id, posted_at)
          VALUES ('00000000-0000-0000-0000-0000000b11ad', '${ORG_A}', '${PERIOD_A}', 'DOUBLE_ENTRY', '${DOC_A}', '${EVENT_A}', '2025-05-01', 'SIMPLE', '${USER}', now())
        `)
      }),
    ).rejects.toThrow()

    // confirm nothing landed (admin bypasses RLS to see the truth)
    const [row] = await admin.unsafe<Array<{ id: string }>>(
      `SELECT id FROM posting WHERE id = '00000000-0000-0000-0000-0000000b11ad'::uuid`,
    )
    expect(row).toBeUndefined()
  })
})

// ===========================================================================
// Read-model (account_period_balance + opening vs turnover)
//
// Runs BEFORE the mutating describe blocks so the seed-only state is asserted:
// nothing before this point has changed 518 / 321 / 211 / 701 (the RLS block's
// one write attempt is rejected + rolled back). 518 is forever stable anyway
// (it gains analytical children below, so it can never be re-posted directly).
// ===========================================================================
describe("read-model maintenance", () => {
  it("(16) the seed's balanced posting feeds account_period_balance: 518 cb=1000, 321 cb=-1000", async () => {
    // 518 (expense, DEBIT) closing = +1000; 321 (liability, CREDIT) closing = -1000.
    const [r518] = await admin.unsafe<Array<{ closing_balance: string }>>(
      `SELECT closing_balance FROM account_period_balance WHERE account_id = '${ACC_518}'::uuid AND period_id = '${PERIOD_A}'::uuid`,
    )
    const [r321] = await admin.unsafe<Array<{ closing_balance: string }>>(
      `SELECT closing_balance FROM account_period_balance WHERE account_id = '${ACC_321}'::uuid AND period_id = '${PERIOD_A}'::uuid`,
    )
    expect(Number(r518?.closing_balance)).toBe(1000)
    expect(Number(r321?.closing_balance)).toBe(-1000)
  })

  it("(17) an is_opening 701 posting feeds opening_balance, NOT turnover (211 opening=8000, turnover=0; 701 opening=-8000)", async () => {
    // 211 (asset) DEBIT 8000 / 701 (closing) CREDIT 8000, flagged is_opening.
    await admin.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.organization_id', '${ORG_A}', true)`,
      )
      await tx.unsafe(`
        INSERT INTO posting (id, organization_id, period_id, regime_code, summary_record_id, accounting_event_id, posting_date, posting_kind, responsible_user_id, posted_at, is_opening)
        VALUES ('00000000-0000-0000-0000-0000000090ad', '${ORG_A}', '${PERIOD_A}', 'DOUBLE_ENTRY', '${DOC_A}', '${EVENT_A}', '2025-01-01', 'SIMPLE', '${USER}', now(), true)
        ON CONFLICT (id) DO NOTHING
      `)
      await tx.unsafe(`
        INSERT INTO posting_double_entry_line (id, organization_id, posting_id, period_id, regime_code, account_id, side, amount) VALUES
          ('00000000-0000-0000-0000-000000009001', '${ORG_A}', '00000000-0000-0000-0000-0000000090ad', '${PERIOD_A}', 'DOUBLE_ENTRY', '${ACC_211}', 'DEBIT', 8000),
          ('00000000-0000-0000-0000-000000009002', '${ORG_A}', '00000000-0000-0000-0000-0000000090ad', '${PERIOD_A}', 'DOUBLE_ENTRY', '${ACC_701}', 'CREDIT', 8000)
        ON CONFLICT (id) DO NOTHING
      `)
    })

    const [r211] = await admin.unsafe<
      Array<{ opening_balance: string; turnover_debit: string }>
    >(
      `SELECT opening_balance, turnover_debit FROM account_period_balance WHERE account_id = '${ACC_211}'::uuid AND period_id = '${PERIOD_A}'::uuid`,
    )
    const [r701] = await admin.unsafe<Array<{ opening_balance: string }>>(
      `SELECT opening_balance FROM account_period_balance WHERE account_id = '${ACC_701}'::uuid AND period_id = '${PERIOD_A}'::uuid`,
    )
    expect(Number(r211?.opening_balance)).toBe(8000)
    expect(Number(r211?.turnover_debit)).toBe(0)
    expect(Number(r701?.opening_balance)).toBe(-8000)

    // the opening lines STILL appear in the deník (journal)
    const lines = await admin.unsafe<Array<{ id: string }>>(
      `SELECT id FROM posting_double_entry_line WHERE posting_id = '00000000-0000-0000-0000-0000000090ad'::uuid`,
    )
    expect(lines).toHaveLength(2)
  })
})

// ===========================================================================
// Posting correctness (R4 + regime + §16 + opening + off-balance)
// ===========================================================================
describe("posting correctness", () => {
  // helper: insert a posting header + arbitrary DE lines inside one admin tx,
  // returning the promise so callers can assert resolve/reject at COMMIT.
  async function postWithLines(
    postingId: string,
    date: string,
    lines: Array<{ id: string; account: string; side: string; amount: number }>,
    opts: { isOpening?: boolean; period?: string } = {},
  ): Promise<string> {
    const period = opts.period ?? PERIOD_A
    await admin.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.organization_id', '${ORG_A}', true)`,
      )
      await tx.unsafe(`
        INSERT INTO posting (id, organization_id, period_id, regime_code, summary_record_id, accounting_event_id, posting_date, posting_kind, responsible_user_id, posted_at, is_opening)
        VALUES ('${postingId}', '${ORG_A}', '${period}', 'DOUBLE_ENTRY', '${DOC_A}', '${EVENT_A}', '${date}', 'SIMPLE', '${USER}', now(), ${opts.isOpening ? "true" : "false"})
      `)
      for (const l of lines) {
        await tx.unsafe(`
          INSERT INTO posting_double_entry_line (id, organization_id, posting_id, period_id, regime_code, account_id, side, amount)
          VALUES ('${l.id}', '${ORG_A}', '${postingId}', '${period}', 'DOUBLE_ENTRY', '${l.account}', '${l.side}', ${l.amount})
        `)
      }
    })
    return postingId
  }

  it("(3) a balanced DOUBLE_ENTRY posting commits", async () => {
    // Use leaf accounts 311 (DEBIT) / 321 (CREDIT) — 518 is a synthetic-with-
    // children (518.001) so §16 would block a direct post to it (see test 8).
    await expect(
      postWithLines("00000000-0000-0000-0000-0000000070ad", "2025-04-03", [
        {
          id: "00000000-0000-0000-0000-000000007001",
          account: ACC_311,
          side: "DEBIT",
          amount: 500,
        },
        {
          id: "00000000-0000-0000-0000-000000007002",
          account: ACC_321,
          side: "CREDIT",
          amount: 500,
        },
      ]),
    ).resolves.toBe("00000000-0000-0000-0000-0000000070ad")
    const [row] = await admin.unsafe<Array<{ id: string }>>(
      `SELECT id FROM posting WHERE id = '00000000-0000-0000-0000-0000000070ad'::uuid`,
    )
    expect(row?.id).toBe("00000000-0000-0000-0000-0000000070ad")
  })

  it("(4) an unbalanced posting (ΣMD≠ΣDal) is rejected at COMMIT (R4 deferred trigger)", async () => {
    // Leaf accounts 311/321 so §16 (synthetic-with-children) does not pre-empt;
    // the rejection must be the R4 balance check (1000 ≠ 999).
    await expect(
      postWithLines("00000000-0000-0000-0000-000000005bad", "2025-04-01", [
        {
          id: "00000000-0000-0000-0000-000000005b01",
          account: ACC_311,
          side: "DEBIT",
          amount: 1000,
        },
        {
          id: "00000000-0000-0000-0000-000000005b02",
          account: ACC_321,
          side: "CREDIT",
          amount: 999,
        },
      ]),
    ).rejects.toThrow(/unbalanced/)
    const [row] = await admin.unsafe<Array<{ id: string }>>(
      `SELECT id FROM posting WHERE id = '00000000-0000-0000-0000-000000005bad'::uuid`,
    )
    expect(row).toBeUndefined()
  })

  it("(5) a single-sided on-balance posting is rejected (need >=2 lines for a double entry)", async () => {
    // Leaf account 311 so the rejection is the single-sided R4 check, not §16.
    await expect(
      postWithLines("00000000-0000-0000-0000-0000000061ad", "2025-04-02", [
        {
          id: "00000000-0000-0000-0000-000000006101",
          account: ACC_311,
          side: "DEBIT",
          amount: 1000,
        },
      ]),
    ).rejects.toThrow(/single-sided/)
    const [row] = await admin.unsafe<Array<{ id: string }>>(
      `SELECT id FROM posting WHERE id = '00000000-0000-0000-0000-0000000061ad'::uuid`,
    )
    expect(row).toBeUndefined()
  })

  it("(6) an OFF_BALANCE single-sided line (751) commits (M1 podrozvaha exemption)", async () => {
    await expect(
      postWithLines("00000000-0000-0000-0000-0000000080ad", "2025-04-04", [
        {
          id: "00000000-0000-0000-0000-000000008001",
          account: ACC_751,
          side: "DEBIT",
          amount: 5000,
        },
      ]),
    ).resolves.toBe("00000000-0000-0000-0000-0000000080ad")
    const [row] = await admin.unsafe<Array<{ id: string }>>(
      `SELECT id FROM posting WHERE id = '00000000-0000-0000-0000-0000000080ad'::uuid`,
    )
    expect(row?.id).toBe("00000000-0000-0000-0000-0000000080ad")
  })

  it("(7) an opening (is_opening) posting touching a 5xx P&L account is rejected (ČÚS 002)", async () => {
    // 518.001 is a 5xx LEAF (an EXPENSE/P&L account) — using it ensures the
    // rejection is the opening-P&L rule, not §16 (which would fire on synthetic
    // 518). The opposing 701 leg keeps the posting balanced so R4 passes and the
    // is_opening P&L check is what trips.
    await expect(
      postWithLines(
        "00000000-0000-0000-0000-0000000091ad",
        "2025-01-01",
        [
          {
            id: "00000000-0000-0000-0000-000000009101",
            account: ACC_518_CHILD,
            side: "DEBIT",
            amount: 800,
          },
          {
            id: "00000000-0000-0000-0000-000000009102",
            account: ACC_701,
            side: "CREDIT",
            amount: 800,
          },
        ],
        { isOpening: true },
      ),
    ).rejects.toThrow(/P&L/)
    const [row] = await admin.unsafe<Array<{ id: string }>>(
      `SELECT id FROM posting WHERE id = '00000000-0000-0000-0000-0000000091ad'::uuid`,
    )
    expect(row).toBeUndefined()
  })

  it("(8) §16: a direct posting to a synthetic that HAS analytical children (518) is rejected", async () => {
    // 518 has child 518.001 -> posting straight to 518 must fail (block_post_to_parent).
    await expect(
      postWithLines("00000000-0000-0000-0000-0000000131ad", "2025-04-05", [
        {
          id: "00000000-0000-0000-0000-000000013101",
          account: ACC_518,
          side: "DEBIT",
          amount: 100,
        },
        {
          id: "00000000-0000-0000-0000-000000013102",
          account: ACC_321,
          side: "CREDIT",
          amount: 100,
        },
      ]),
    ).rejects.toThrow(/analytical children/)
    const [row] = await admin.unsafe<Array<{ id: string }>>(
      `SELECT id FROM posting WHERE id = '00000000-0000-0000-0000-0000000131ad'::uuid`,
    )
    expect(row).toBeUndefined()
  })

  it("(8b) §16: posting to the analytical child 518.001 IS allowed", async () => {
    await expect(
      postWithLines("00000000-0000-0000-0000-0000000132ad", "2025-04-06", [
        {
          id: "00000000-0000-0000-0000-000000013201",
          account: ACC_518_CHILD,
          side: "DEBIT",
          amount: 100,
        },
        {
          id: "00000000-0000-0000-0000-000000013202",
          account: ACC_321,
          side: "CREDIT",
          amount: 100,
        },
      ]),
    ).resolves.toBe("00000000-0000-0000-0000-0000000132ad")
    const [row] = await admin.unsafe<Array<{ id: string }>>(
      `SELECT id FROM posting WHERE id = '00000000-0000-0000-0000-0000000132ad'::uuid`,
    )
    expect(row?.id).toBe("00000000-0000-0000-0000-0000000132ad")
  })

  it("(9) regime: a posting_double_entry_line on a non-DOUBLE_ENTRY (SINGLE_ENTRY) posting is rejected", async () => {
    // A SINGLE_ENTRY posting may not carry a double-entry line: the line's
    // regime_code CHECK pins it to DOUBLE_ENTRY, and the composite regime-FK to
    // the posting (id, org, regime) then has no DOUBLE_ENTRY parent to match.
    await expect(
      admin.begin(async (tx) => {
        await tx.unsafe(
          `SELECT set_config('app.organization_id', '${ORG_A}', true)`,
        )
        await tx.unsafe(`
          INSERT INTO posting (id, organization_id, period_id, regime_code, summary_record_id, accounting_event_id, posting_date, posting_kind, responsible_user_id, posted_at)
          VALUES ('00000000-0000-0000-0000-0000000091de', '${ORG_A}', '${PERIOD_A_SE}', 'SINGLE_ENTRY', '${DOC_A_SE}', '${EVENT_A_SE}', '2024-06-01', 'SIMPLE', '${USER}', now())
        `)
        await tx.unsafe(`
          INSERT INTO posting_double_entry_line (id, organization_id, posting_id, period_id, regime_code, account_id, side, amount)
          VALUES ('00000000-0000-0000-0000-0000000091d1', '${ORG_A}', '00000000-0000-0000-0000-0000000091de', '${PERIOD_A_SE}', 'DOUBLE_ENTRY', '${ACC_211}', 'DEBIT', 100)
        `)
      }),
    ).rejects.toThrow()
    const [row] = await admin.unsafe<Array<{ id: string }>>(
      `SELECT id FROM posting WHERE id = '00000000-0000-0000-0000-0000000091de'::uuid`,
    )
    expect(row).toBeUndefined()
  })
})

// ===========================================================================
// Append-only (R8 §35)
// ===========================================================================
describe("append-only (R8 §35)", () => {
  it("(10) UPDATE on a posting is rejected — even for the superuser/owner (BEFORE trigger)", async () => {
    await expect(
      admin.unsafe(
        `UPDATE posting SET posting_kind = 'COMPOUND' WHERE id = '${POSTING_A}'::uuid`,
      ),
    ).rejects.toThrow(/append-only/)
    const [row] = await admin.unsafe<Array<{ posting_kind: string }>>(
      `SELECT posting_kind FROM posting WHERE id = '${POSTING_A}'::uuid`,
    )
    expect(row?.posting_kind).toBe("SIMPLE")
  })

  it("[I4] (10b) DELETE on a posting HEADER is rejected — even for the superuser/owner (BEFORE trigger)", async () => {
    // Constitution I4: a posted record is corrected by a NEW correcting
    // posting (corrects_posting_id, R8 ČÚS 001 §35), never a physical
    // delete. Test (10) above proves UPDATE is blocked on the SAME
    // POSTING_A header; this proves DELETE is too — the append-only pair
    // the invariant requires.
    await expect(
      admin.unsafe(`DELETE FROM posting WHERE id = '${POSTING_A}'::uuid`),
    ).rejects.toThrow(/append-only/)
    const [row] = await admin.unsafe<Array<{ id: string }>>(
      `SELECT id FROM posting WHERE id = '${POSTING_A}'::uuid`,
    )
    expect(row?.id).toBe(POSTING_A)
  })

  it("(11) DELETE on a posting line is rejected — superuser AND app_user blocked", async () => {
    // superuser is blocked by the BEFORE trigger (fires for all roles)
    await expect(
      admin.unsafe(
        `DELETE FROM posting_double_entry_line WHERE id = '00000000-0000-0000-0000-000000000901'::uuid`,
      ),
    ).rejects.toThrow(/append-only/)

    // app_user is ALSO blocked (no UPDATE/DELETE grant + the trigger)
    await expect(
      asOrg(ORG_A, async (tx) => {
        await tx.unsafe(
          `DELETE FROM posting_double_entry_line WHERE id = '00000000-0000-0000-0000-000000000901'::uuid`,
        )
      }),
    ).rejects.toThrow()

    const [row] = await admin.unsafe<Array<{ id: string }>>(
      `SELECT id FROM posting_double_entry_line WHERE id = '00000000-0000-0000-0000-000000000901'::uuid`,
    )
    expect(row?.id).toBe("00000000-0000-0000-0000-000000000901")
  })
})

// ===========================================================================
// Period guard (closed-period + date∈period membership)
// ===========================================================================
describe("period guard (R12 §17 + datum ∈ období)", () => {
  // Each test that needs the period CLOSED toggles it via setPeriodStatus
  // (which runs the status change under SET LOCAL ROLE app_admin so the reopen
  // gate is satisfied) and restores OPEN in a finally, so other describe blocks
  // always see an open period.
  async function withClosedPeriodA(fn: () => Promise<void>): Promise<void> {
    await setPeriodStatus(PERIOD_A, "CLOSED")
    try {
      await fn()
    } finally {
      await setPeriodStatus(PERIOD_A, "OPEN")
    }
  }

  it("(12) INSERT of a posting header into a CLOSED period is rejected", async () => {
    await withClosedPeriodA(async () => {
      await expect(
        admin.begin(async (tx) => {
          await tx.unsafe(
            `SELECT set_config('app.organization_id', '${ORG_A}', true)`,
          )
          await tx.unsafe(`
            INSERT INTO posting (id, organization_id, period_id, regime_code, summary_record_id, accounting_event_id, posting_date, posting_kind, responsible_user_id, posted_at)
            VALUES ('00000000-0000-0000-0000-000000000ccc', '${ORG_A}', '${PERIOD_A}', 'DOUBLE_ENTRY', '${DOC_A}', '${EVENT_A}', '2025-03-11', 'SIMPLE', '${USER}', now())
          `)
        }),
      ).rejects.toThrow(/CLOSED/)
    })
    const [row] = await admin.unsafe<Array<{ id: string }>>(
      `SELECT id FROM posting WHERE id = '00000000-0000-0000-0000-000000000ccc'::uuid`,
    )
    expect(row).toBeUndefined()
  })

  it("(13) INSERT of a posting LINE into a now-closed period is rejected (M6 line-level guard)", async () => {
    // Insert a fresh header into the OPEN period, then close it, then attempt to
    // append a line — the line-level period guard reads the CURRENT status.
    await admin.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.organization_id', '${ORG_A}', true)`,
      )
      await tx.unsafe(`
        INSERT INTO posting (id, organization_id, period_id, regime_code, summary_record_id, accounting_event_id, posting_date, posting_kind, responsible_user_id, posted_at)
        VALUES ('00000000-0000-0000-0000-00000000c13a', '${ORG_A}', '${PERIOD_A}', 'DOUBLE_ENTRY', '${DOC_A}', '${EVENT_A}', '2025-03-12', 'SIMPLE', '${USER}', now())
        ON CONFLICT (id) DO NOTHING
      `)
      // two balanced lines so the header is a valid committed posting
      await tx.unsafe(`
        INSERT INTO posting_double_entry_line (id, organization_id, posting_id, period_id, regime_code, account_id, side, amount) VALUES
          ('00000000-0000-0000-0000-00000000c13b', '${ORG_A}', '00000000-0000-0000-0000-00000000c13a', '${PERIOD_A}', 'DOUBLE_ENTRY', '${ACC_211}', 'DEBIT', 10),
          ('00000000-0000-0000-0000-00000000c13c', '${ORG_A}', '00000000-0000-0000-0000-00000000c13a', '${PERIOD_A}', 'DOUBLE_ENTRY', '${ACC_321}', 'CREDIT', 10)
        ON CONFLICT (id) DO NOTHING
      `)
    })
    await withClosedPeriodA(async () => {
      await expect(
        admin.begin(async (tx) => {
          await tx.unsafe(
            `SELECT set_config('app.organization_id', '${ORG_A}', true)`,
          )
          await tx.unsafe(`
            INSERT INTO posting_double_entry_line (id, organization_id, posting_id, period_id, regime_code, account_id, side, amount)
            VALUES ('00000000-0000-0000-0000-00000000c13d', '${ORG_A}', '00000000-0000-0000-0000-00000000c13a', '${PERIOD_A}', 'DOUBLE_ENTRY', '${ACC_211}', 'DEBIT', 99)
          `)
        }),
      ).rejects.toThrow(/CLOSED/)
    })
    const [row] = await admin.unsafe<Array<{ id: string }>>(
      `SELECT id FROM posting_double_entry_line WHERE id = '00000000-0000-0000-0000-00000000c13d'::uuid`,
    )
    expect(row).toBeUndefined()
  })

  it("(14) a posting_date outside the period (2099 in a 2025 period) is rejected", async () => {
    await expect(
      admin.begin(async (tx) => {
        await tx.unsafe(
          `SELECT set_config('app.organization_id', '${ORG_A}', true)`,
        )
        await tx.unsafe(`
          INSERT INTO posting (id, organization_id, period_id, regime_code, summary_record_id, accounting_event_id, posting_date, posting_kind, responsible_user_id, posted_at)
          VALUES ('00000000-0000-0000-0000-000000000ddd', '${ORG_A}', '${PERIOD_A}', 'DOUBLE_ENTRY', '${DOC_A}', '${EVENT_A}', '2099-01-01', 'SIMPLE', '${USER}', now())
        `)
      }),
    ).rejects.toThrow(/outside its period/)
    const [row] = await admin.unsafe<Array<{ id: string }>>(
      `SELECT id FROM posting WHERE id = '00000000-0000-0000-0000-000000000ddd'::uuid`,
    )
    expect(row).toBeUndefined()
  })

  it("(15) an accounting_event occurred_at outside the period is rejected", async () => {
    await expect(
      admin.begin(async (tx) => {
        await tx.unsafe(
          `SELECT set_config('app.organization_id', '${ORG_A}', true)`,
        )
        await tx.unsafe(`
          INSERT INTO accounting_event (id, organization_id, workspace_id, period_id, number_series_id, sequence_number, designation, description, occurred_at, responsible_user_id)
          VALUES ('00000000-0000-0000-0000-0000000e1599', '${ORG_A}', '${WORKSPACE}', '${PERIOD_A}', '${SERIES_EV}', 99, 'EV0099', 'Outside', '2099-06-01', '${USER}')
        `)
      }),
    ).rejects.toThrow(/outside its period/)
    const [row] = await admin.unsafe<Array<{ id: string }>>(
      `SELECT id FROM accounting_event WHERE id = '00000000-0000-0000-0000-0000000e1599'::uuid`,
    )
    expect(row).toBeUndefined()
  })

  it("(14d) app_user cannot reopen a CLOSED period (reopen gate)", async () => {
    await setPeriodStatus(PERIOD_A, "CLOSED")
    try {
      // app_user attempts CLOSED -> OPEN; the reopen gate blocks plain app_user.
      // The UPDATE also matches via RLS USING (org A scope), so the row IS
      // targeted — the gate, not RLS invisibility, is what rejects it.
      await expect(
        asOrg(ORG_A, async (tx) => {
          await tx.unsafe(
            `UPDATE accounting_period SET status = 'OPEN' WHERE id = '${PERIOD_A}'::uuid`,
          )
        }),
      ).rejects.toThrow(/reopened/)
      const [row] = await admin.unsafe<Array<{ status: string }>>(
        `SELECT status FROM accounting_period WHERE id = '${PERIOD_A}'::uuid`,
      )
      expect(row?.status).toBe("CLOSED")
    } finally {
      await setPeriodStatus(PERIOD_A, "OPEN")
    }
  })
})

// ===========================================================================
// Cash regime (peněžní deník) minimum-line invariant
// ===========================================================================
describe("cash regime (peněžní deník)", () => {
  it("(C1) an empty SINGLE_ENTRY cash posting (no monetary line) is rejected at COMMIT", async () => {
    await expect(
      admin.begin(async (tx) => {
        await tx.unsafe(
          `SELECT set_config('app.organization_id', '${ORG_A}', true)`,
        )
        await tx.unsafe(`
          INSERT INTO posting (id, organization_id, period_id, regime_code, summary_record_id, accounting_event_id, posting_date, posting_kind, responsible_user_id, posted_at)
          VALUES ('00000000-0000-0000-0000-0000000021ad', '${ORG_A}', '${PERIOD_A_SE}', 'SINGLE_ENTRY', '${DOC_A_SE}', '${EVENT_A_SE}', '2024-06-01', 'SIMPLE', '${USER}', now())
        `)
      }),
    ).rejects.toThrow(/no peněžní-deník line/)
    const [row] = await admin.unsafe<Array<{ id: string }>>(
      `SELECT id FROM posting WHERE id = '00000000-0000-0000-0000-0000000021ad'::uuid`,
    )
    expect(row).toBeUndefined()
  })

  it("(C2) a cash posting WITH a monetary line commits + feeds monetary_period_summary = 5000", async () => {
    await expect(
      admin.begin(async (tx) => {
        await tx.unsafe(
          `SELECT set_config('app.organization_id', '${ORG_A}', true)`,
        )
        await tx.unsafe(`
          INSERT INTO posting (id, organization_id, period_id, regime_code, summary_record_id, accounting_event_id, posting_date, posting_kind, responsible_user_id, posted_at)
          VALUES ('00000000-0000-0000-0000-0000000021bd', '${ORG_A}', '${PERIOD_A_SE}', 'SINGLE_ENTRY', '${DOC_A_SE}', '${EVENT_A_SE}', '2024-06-01', 'SIMPLE', '${USER}', now())
        `)
        await tx.unsafe(`
          INSERT INTO posting_monetary_line (id, organization_id, posting_id, regime_code, location, direction, is_tax_relevant, is_clearing, tax_base, amount)
          VALUES ('00000000-0000-0000-0000-000000021b01', '${ORG_A}', '00000000-0000-0000-0000-0000000021bd', 'SINGLE_ENTRY', 'CASH', 'INFLOW', true, false, 5000, 5000)
        `)
      }),
    ).resolves.toBeUndefined() // the tx COMMITs (no throw); resolved value is unused

    // the posting landed and the monetary read-model was maintained
    const [posted] = await admin.unsafe<Array<{ id: string }>>(
      `SELECT id FROM posting WHERE id = '00000000-0000-0000-0000-0000000021bd'::uuid`,
    )
    expect(posted?.id).toBe("00000000-0000-0000-0000-0000000021bd")
    const [row] = await admin.unsafe<Array<{ total_amount: string }>>(
      `SELECT total_amount FROM monetary_period_summary WHERE period_id = '${PERIOD_A_SE}'::uuid`,
    )
    expect(Number(row?.total_amount)).toBe(5000)
  })
})

// ===========================================================================
// Saldokonto (open_item / open_item_settlement) — port of open-item-test.sql
// ===========================================================================
describe("saldokonto (open items)", () => {
  it("(S1) inserting an open_item yields settled=0, remaining=original, is_settled=false (generated cols)", async () => {
    await admin.unsafe(
      `SELECT set_config('app.organization_id', '${ORG_A}', false)`,
    )
    await admin.unsafe(`
      INSERT INTO open_item (id, organization_id, workspace_id, counterparty_id, origin_posting_id, account_number, direction, original_amount, currency_code, issue_date, due_date)
      VALUES ('${OPEN_ITEM}', '${ORG_A}', '${WORKSPACE}', '${CP_VENDOR}', '${INV_POSTING}', '311', 'RECEIVABLE', 1000, 'CZK', '2025-03-10', '2025-04-10')
      ON CONFLICT (id) DO NOTHING
    `)
    const [row] = await admin.unsafe<
      Array<{
        settled_amount: string
        remaining_amount: string
        is_settled: boolean
      }>
    >(
      `SELECT settled_amount, remaining_amount, is_settled FROM open_item WHERE id = '${OPEN_ITEM}'::uuid`,
    )
    expect(Number(row?.settled_amount)).toBe(0)
    expect(Number(row?.remaining_amount)).toBe(1000)
    expect(row?.is_settled).toBe(false)
  })

  it("(S2) a partial settlement (400) maintains settled_amount via trigger: settled=400, remaining=600, is_settled=false", async () => {
    await admin.unsafe(`
      INSERT INTO open_item_settlement (id, organization_id, open_item_id, settling_posting_id, amount, settlement_date)
      VALUES ('00000000-0000-0000-0000-00000000a0b1', '${ORG_A}', '${OPEN_ITEM}', '${PAY_POSTING}', 400, '2025-04-01')
      ON CONFLICT (id) DO NOTHING
    `)
    const [row] = await admin.unsafe<
      Array<{
        settled_amount: string
        remaining_amount: string
        is_settled: boolean
      }>
    >(
      `SELECT settled_amount, remaining_amount, is_settled FROM open_item WHERE id = '${OPEN_ITEM}'::uuid`,
    )
    expect(Number(row?.settled_amount)).toBe(400)
    expect(Number(row?.remaining_amount)).toBe(600)
    expect(row?.is_settled).toBe(false)
  })

  it("(S3) a second settlement (600) fully settles: settled=1000, remaining=0, is_settled=true", async () => {
    await admin.unsafe(`
      INSERT INTO open_item_settlement (id, organization_id, open_item_id, settling_posting_id, amount, settlement_date)
      VALUES ('00000000-0000-0000-0000-00000000a0b2', '${ORG_A}', '${OPEN_ITEM}', '${PAY_POSTING}', 600, '2025-04-15')
      ON CONFLICT (id) DO NOTHING
    `)
    const [row] = await admin.unsafe<
      Array<{
        settled_amount: string
        remaining_amount: string
        is_settled: boolean
      }>
    >(
      `SELECT settled_amount, remaining_amount, is_settled FROM open_item WHERE id = '${OPEN_ITEM}'::uuid`,
    )
    expect(Number(row?.settled_amount)).toBe(1000)
    expect(Number(row?.remaining_amount)).toBe(0)
    expect(row?.is_settled).toBe(true)
  })

  it("(S4) over-settlement (+100) -> settled=1100, remaining=-100 (přeplatek), is_settled=true", async () => {
    await admin.unsafe(`
      INSERT INTO open_item_settlement (id, organization_id, open_item_id, settling_posting_id, amount, settlement_date)
      VALUES ('00000000-0000-0000-0000-00000000a0b3', '${ORG_A}', '${OPEN_ITEM}', '${PAY_POSTING}', 100, '2025-04-20')
      ON CONFLICT (id) DO NOTHING
    `)
    const [row] = await admin.unsafe<
      Array<{
        settled_amount: string
        remaining_amount: string
        is_settled: boolean
      }>
    >(
      `SELECT settled_amount, remaining_amount, is_settled FROM open_item WHERE id = '${OPEN_ITEM}'::uuid`,
    )
    expect(Number(row?.settled_amount)).toBe(1100)
    expect(Number(row?.remaining_amount)).toBe(-100)
    expect(row?.is_settled).toBe(true)
  })

  it("(S5) a negative settlement / rozpárování (-100) reverts settled back to 1000", async () => {
    await admin.unsafe(`
      INSERT INTO open_item_settlement (id, organization_id, open_item_id, settling_posting_id, amount, settlement_date)
      VALUES ('00000000-0000-0000-0000-00000000a0b4', '${ORG_A}', '${OPEN_ITEM}', '${PAY_POSTING}', -100, '2025-04-21')
      ON CONFLICT (id) DO NOTHING
    `)
    const [row] = await admin.unsafe<
      Array<{
        settled_amount: string
        remaining_amount: string
        is_settled: boolean
      }>
    >(
      `SELECT settled_amount, remaining_amount, is_settled FROM open_item WHERE id = '${OPEN_ITEM}'::uuid`,
    )
    expect(Number(row?.settled_amount)).toBe(1000)
    expect(Number(row?.remaining_amount)).toBe(0)
    expect(row?.is_settled).toBe(true)
  })

  it("(S6) append-only: UPDATE and DELETE on open_item_settlement are rejected (R8)", async () => {
    await expect(
      admin.unsafe(
        `UPDATE open_item_settlement SET amount = 999 WHERE id = '00000000-0000-0000-0000-00000000a0b1'::uuid`,
      ),
    ).rejects.toThrow(/append-only/)
    await expect(
      admin.unsafe(
        `DELETE FROM open_item_settlement WHERE id = '00000000-0000-0000-0000-00000000a0b1'::uuid`,
      ),
    ).rejects.toThrow(/append-only/)
    const [row] = await admin.unsafe<Array<{ amount: string }>>(
      `SELECT amount FROM open_item_settlement WHERE id = '00000000-0000-0000-0000-00000000a0b1'::uuid`,
    )
    expect(Number(row?.amount)).toBe(400)
  })

  it("(S7) a same-org app_user CANNOT directly UPDATE open_item — the tamper-lock BEFORE trigger blocks it (settled_amount moves only via the settlement ledger)", async () => {
    // The 0034 REVOKE UPDATE/DELETE on open_item from app_user is NOT sufficient on
    // its own: app_user inherits app_admin's table DML, so the REVOKE is bypassable
    // (has_table_privilege('app_user','open_item','UPDATE') stays true). The
    // authoritative block is the app_block_open_item_direct_write() BEFORE trigger
    // (review-fix v2): a direct write by the runtime role raises insufficient_privilege,
    // while the SECURITY DEFINER settlement trigger (current_user = app_owner) passes.
    await expect(
      asOrg(ORG_A, async (tx) => {
        await tx.unsafe(
          `UPDATE open_item SET settled_amount = 0 WHERE id = '${OPEN_ITEM}'::uuid`,
        )
      }),
    ).rejects.toThrow(
      /maintained by the settlement ledger|insufficient_privilege/i,
    )

    // settled_amount is untouched (still 1000 from S5), confirmed via admin.
    const [row] = await admin.unsafe<Array<{ settled_amount: string }>>(
      `SELECT settled_amount FROM open_item WHERE id = '${OPEN_ITEM}'::uuid`,
    )
    expect(Number(row?.settled_amount)).toBe(1000)
  })

  it("(S7b) a foreign-org (org B) app_user cannot even target org A's open_item — RLS hides the row (0 rows affected)", async () => {
    const updated = await asOrg(ORG_B, async (tx) =>
      tx.unsafe<Array<{ id: string }>>(
        `UPDATE open_item SET variable_symbol = 'x' WHERE id = '${OPEN_ITEM}'::uuid RETURNING id`,
      ),
    )
    expect(updated).toHaveLength(0) // org B's RLS USING hides org A's row -> 0 affected
  })

  it("(S8) org A app_user sees zero of org B's open_item (RLS USING)", async () => {
    const rows = await asOrg(ORG_A, async (tx) =>
      tx.unsafe<Array<{ id: string }>>(
        `SELECT id FROM open_item WHERE id = '${ORG_B_OPEN_ITEM}'::uuid`,
      ),
    )
    expect(rows).toHaveLength(0)
  })

  it("(S9) cross-org open_item INSERT (org B id while GUC=org A) is rejected by RLS WITH CHECK", async () => {
    await expect(
      asOrg(ORG_A, async (tx) => {
        await tx.unsafe(`
          INSERT INTO open_item (id, organization_id, workspace_id, counterparty_id, origin_posting_id, account_number, direction, original_amount, currency_code, issue_date)
          VALUES ('00000000-0000-0000-0000-00000000a0ff', '${ORG_B}', '${WORKSPACE}', '${CP_VENDOR}', '${INV_POSTING}', '311', 'RECEIVABLE', 999, 'CZK', '2025-05-01')
        `)
      }),
    ).rejects.toThrow()
    const [row] = await admin.unsafe<Array<{ id: string }>>(
      `SELECT id FROM open_item WHERE id = '00000000-0000-0000-0000-00000000a0ff'::uuid`,
    )
    expect(row).toBeUndefined()
  })

  it("(S10) cross-tenant composite-FK: settlement with org B org_id + org A open_item_id is rejected", async () => {
    // Composite FK (open_item_id, organization_id) -> open_item (id, organization_id):
    // no row (OPEN_ITEM, ORG_B) exists, so the FK fails. Done as superuser so RLS
    // is not what rejects it — the composite FK is.
    await expect(
      admin.begin(async (tx) => {
        await tx.unsafe(
          `SELECT set_config('app.organization_id', '${ORG_B}', true)`,
        )
        await tx.unsafe(`
          INSERT INTO open_item_settlement (id, organization_id, open_item_id, settling_posting_id, amount, settlement_date)
          VALUES ('00000000-0000-0000-0000-00000000a0ee', '${ORG_B}', '${OPEN_ITEM}', '${ORG_B_POSTING}', 100, '2025-05-10')
        `)
      }),
    ).rejects.toThrow()
    const [row] = await admin.unsafe<Array<{ id: string }>>(
      `SELECT id FROM open_item_settlement WHERE id = '00000000-0000-0000-0000-00000000a0ee'::uuid`,
    )
    expect(row).toBeUndefined()
  })

  it("(S11) a settlement into a CLOSED period is rejected (settlement period guard)", async () => {
    // The settling posting (PAY_POSTING) is in PERIOD_A; close it and attempt a
    // settlement -> the BEFORE INSERT period guard rejects.
    await setPeriodStatus(PERIOD_A, "CLOSED")
    try {
      await expect(
        admin.begin(async (tx) => {
          await tx.unsafe(
            `SELECT set_config('app.organization_id', '${ORG_A}', true)`,
          )
          await tx.unsafe(`
            INSERT INTO open_item_settlement (id, organization_id, open_item_id, settling_posting_id, amount, settlement_date)
            VALUES ('00000000-0000-0000-0000-00000000a0c1', '${ORG_A}', '${OPEN_ITEM}', '${PAY_POSTING}', 50, '2025-04-25')
          `)
        }),
      ).rejects.toThrow(/CLOSED/)
    } finally {
      await setPeriodStatus(PERIOD_A, "OPEN")
    }
    const [row] = await admin.unsafe<Array<{ id: string }>>(
      `SELECT id FROM open_item_settlement WHERE id = '00000000-0000-0000-0000-00000000a0c1'::uuid`,
    )
    expect(row).toBeUndefined()
  })
})

// ===========================================================================
// Seed validation — statement-line cascade is total
// ===========================================================================
describe("seed validation", () => {
  it("(18) app_unmapped_account_groups() returns 0 rows (every on-statement group has a line)", async () => {
    const rows = await admin.unsafe<Array<{ code: string }>>(
      `SELECT * FROM app_unmapped_account_groups()`,
    )
    expect(rows).toHaveLength(0)
  })
})

// ===========================================================================
// FX coherence (migration 0035 — option C: dormant columns + guards)
// The BEFORE-INSERT guard fires regardless of role, so we exercise it via admin.
// INDIV_A lives in PERIOD_A whose accounting_currency = CZK.
// ===========================================================================
describe("FX coherence", () => {
  const ins = (
    id: string,
    ccy: string,
    baseAcc: number,
    kind: string | null,
    rate: number | null,
  ) =>
    admin.unsafe(
      `INSERT INTO partial_record (id, organization_id, individual_record_id, base_amount, vat_mode, vat_amount, currency_code, base_in_accounting_currency, vat_in_accounting_currency, fx_rate_kind, fx_rate)
       VALUES ('${id}'::uuid, '${ORG_A}', '${INDIV_A}', 1000, 'OUTSIDE_VAT', 0, '${ccy}', ${baseAcc}, 0, ${kind ? `'${kind}'` : "NULL"}, ${rate ?? "NULL"})`,
    )

  beforeAll(async () => {
    await setPeriodStatus(PERIOD_A, "OPEN") // saldokonto tests may have closed it
  })

  it("(FX1) CZK partial_record with an FX rate set is rejected (currency = accounting_currency => no FX)", async () => {
    await expect(
      ins("00000000-0000-0000-0000-0000000f0001", "CZK", 1000, "DAILY", 25),
    ).rejects.toThrow(/accounting_currency.*FX rate is set|FX rate is set/i)
  })

  it("(FX2) CZK partial_record whose frozen accounting amount != source amount is rejected", async () => {
    await expect(
      ins("00000000-0000-0000-0000-0000000f0002", "CZK", 999, null, null),
    ).rejects.toThrow(/must equal the source amounts/i)
  })

  it("(FX3) a foreign-currency (EUR) partial_record with no fx_rate is rejected", async () => {
    await expect(
      ins("00000000-0000-0000-0000-0000000f0003", "EUR", 25000, null, null),
    ).rejects.toThrow(/requires an fx_rate/i)
  })

  it("(FX4) a coherent foreign-currency (EUR) partial_record with an fx_rate commits", async () => {
    await ins("00000000-0000-0000-0000-0000000f0004", "EUR", 25000, "DAILY", 25)
    const [row] = await admin.unsafe<Array<{ currency_code: string }>>(
      `SELECT currency_code FROM partial_record WHERE id = '00000000-0000-0000-0000-0000000f0004'::uuid`,
    )
    expect(row?.currency_code).toBe("EUR")
  })

  it("(FX5) fx_rate set without fx_rate_kind is rejected by the row-local CHECK", async () => {
    await expect(
      ins("00000000-0000-0000-0000-0000000f0005", "EUR", 25000, null, 25),
    ).rejects.toThrow(/partial_record_fx_pair_chk|fx_pair/i)
  })

  it("(FX6) open_item_settlement carries the dormant FX columns (nullable)", async () => {
    const [col] = await admin.unsafe<Array<{ is_nullable: string }>>(
      `SELECT is_nullable FROM information_schema.columns WHERE table_name='open_item_settlement' AND column_name='settlement_fx_rate'`,
    )
    expect(col?.is_nullable).toBe("YES")
  })

  // §24a functional-currency gate (migration 0036)
  const period = (id: string, ccy: string, policy: string | null) =>
    admin.unsafe(
      `INSERT INTO accounting_period (id, organization_id, period_start, period_end, regime_code, accounting_currency, fx_rate_policy)
       VALUES ('${id}'::uuid, '${ORG_A}', '2030-01-01', '2030-12-31', 'DOUBLE_ENTRY', '${ccy}', ${policy ? `'${policy}'` : "NULL"})`,
    )

  it("(FC1) accounting_currency = PLN (non-functional) is rejected by the §24a gate", async () => {
    await expect(
      period("00000000-0000-0000-0000-0000000fc001", "PLN", null),
    ).rejects.toThrow(/functional_currency_fk|functional/i)
  })

  it("(FC2) accounting_currency = EUR with a FIXED rate policy is accepted", async () => {
    await period("00000000-0000-0000-0000-0000000fc002", "EUR", "FIXED")
    const [row] = await admin.unsafe<Array<{ fx_rate_policy: string }>>(
      `SELECT fx_rate_policy FROM accounting_period WHERE id = '00000000-0000-0000-0000-0000000fc002'::uuid`,
    )
    expect(row?.fx_rate_policy).toBe("FIXED")
  })

  it("(FC3) PLN is still allowed as a transaction/document currency (partial_record)", async () => {
    await ins("00000000-0000-0000-0000-0000000fc003", "PLN", 6000, "DAILY", 6)
    const [row] = await admin.unsafe<Array<{ currency_code: string }>>(
      `SELECT currency_code FROM partial_record WHERE id = '00000000-0000-0000-0000-0000000fc003'::uuid`,
    )
    expect(row?.currency_code).toBe("PLN")
  })
})

// ===========================================================================
// supply_kind (migration 0043) — additive, nullable, CHECK-guarded. Absent /
// NULL is the legacy behavior (souhrnné hlášení kód 0). SERVICES drives kód 3.
// ===========================================================================
describe("supply_kind (migration 0043)", () => {
  const insSk = (id: string, supplyKind: string | null) =>
    admin.unsafe(
      `INSERT INTO partial_record (id, organization_id, individual_record_id, base_amount, vat_mode, vat_amount, currency_code, base_in_accounting_currency, vat_in_accounting_currency, supply_kind)
       VALUES ('${id}'::uuid, '${ORG_A}', '${INDIV_A}', 1000, 'STANDARD', 0, 'CZK', 1000, 0, ${supplyKind ? `'${supplyKind}'` : "NULL"})`,
    )

  it("(SK1) the column exists and is nullable", async () => {
    const [col] = await admin.unsafe<Array<{ is_nullable: string }>>(
      `SELECT is_nullable FROM information_schema.columns WHERE table_name='partial_record' AND column_name='supply_kind'`,
    )
    expect(col?.is_nullable).toBe("YES")
  })

  it("(SK2) a NULL supply_kind is accepted (legacy / undistinguished)", async () => {
    await insSk("00000000-0000-0000-0000-0000000ac001", null)
    const [row] = await admin.unsafe<Array<{ supply_kind: string | null }>>(
      `SELECT supply_kind FROM partial_record WHERE id = '00000000-0000-0000-0000-0000000ac001'::uuid`,
    )
    expect(row?.supply_kind).toBeNull()
  })

  it("(SK3) a valid SupplyKind (SERVICES) is accepted", async () => {
    await insSk("00000000-0000-0000-0000-0000000ac002", "SERVICES")
    const [row] = await admin.unsafe<Array<{ supply_kind: string | null }>>(
      `SELECT supply_kind FROM partial_record WHERE id = '00000000-0000-0000-0000-0000000ac002'::uuid`,
    )
    expect(row?.supply_kind).toBe("SERVICES")
  })

  it("(SK4) an out-of-domain supply_kind is rejected by the CHECK", async () => {
    await expect(
      insSk("00000000-0000-0000-0000-0000000ac003", "BOGUS"),
    ).rejects.toThrow(/partial_record_supply_kind_chk|supply_kind/i)
  })
})

// ===========================================================================
// commodity_code (migration 0046) — §92 kód předmětu plnění for kontrolní
// hlášení A.1/B.1. Additive, nullable, CHECK-guarded to the domain 1/3/4/5.
// NULL = not a §92 domestic PDP row. DISTINCT from supply_kind (souhrnné kód).
// ===========================================================================
describe("commodity_code (migration 0046)", () => {
  const insCc = (id: string, commodityCode: string | null) =>
    admin.unsafe(
      `INSERT INTO partial_record (id, organization_id, individual_record_id, base_amount, vat_mode, vat_amount, currency_code, base_in_accounting_currency, vat_in_accounting_currency, commodity_code)
       VALUES ('${id}'::uuid, '${ORG_A}', '${INDIV_A}', 1000, 'REVERSE_CHARGE', 0, 'CZK', 1000, 0, ${commodityCode ? `'${commodityCode}'` : "NULL"})`,
    )

  it("(CC1) the column exists and is nullable", async () => {
    const [col] = await admin.unsafe<Array<{ is_nullable: string }>>(
      `SELECT is_nullable FROM information_schema.columns WHERE table_name='partial_record' AND column_name='commodity_code'`,
    )
    expect(col?.is_nullable).toBe("YES")
  })

  it("(CC2) a NULL commodity_code is accepted (not a §92 domestic PDP row)", async () => {
    await insCc("00000000-0000-0000-0000-0000000cc001", null)
    const [row] = await admin.unsafe<Array<{ commodity_code: string | null }>>(
      `SELECT commodity_code FROM partial_record WHERE id = '00000000-0000-0000-0000-0000000cc001'::uuid`,
    )
    expect(row?.commodity_code).toBeNull()
  })

  it("(CC3) a valid §92 kód (4 stavební-montážní) is accepted", async () => {
    await insCc("00000000-0000-0000-0000-0000000cc002", "4")
    const [row] = await admin.unsafe<Array<{ commodity_code: string | null }>>(
      `SELECT commodity_code FROM partial_record WHERE id = '00000000-0000-0000-0000-0000000cc002'::uuid`,
    )
    expect(row?.commodity_code).toBe("4")
  })

  it("(CC4) an out-of-domain commodity_code is rejected by the CHECK", async () => {
    await expect(
      insCc("00000000-0000-0000-0000-0000000cc003", "2"),
    ).rejects.toThrow(/partial_record_commodity_code_chk|commodity_code/i)
  })

  it("(CC5) a commodity_code on a non-reverse-charge line is rejected (§92 kód is PDP-only)", async () => {
    await expect(
      admin.unsafe(
        `INSERT INTO partial_record (id, organization_id, individual_record_id, base_amount, vat_mode, vat_amount, currency_code, base_in_accounting_currency, vat_in_accounting_currency, commodity_code)
         VALUES ('00000000-0000-0000-0000-0000000cc004'::uuid, '${ORG_A}', '${INDIV_A}', 1000, 'STANDARD', 0, 'CZK', 1000, 0, '4')`,
      ),
    ).rejects.toThrow(/partial_record_commodity_code_rc_chk|commodity_code/i)
  })

  it("(CC6) a commodity_code on an EU reverse-charge line is rejected (§92 kód is domestic-PDP-only; EU = souhrnné hlášení)", async () => {
    await expect(
      admin.unsafe(
        `INSERT INTO partial_record (id, organization_id, individual_record_id, base_amount, vat_mode, vat_jurisdiction, vat_amount, currency_code, base_in_accounting_currency, vat_in_accounting_currency, commodity_code)
         VALUES ('00000000-0000-0000-0000-0000000cc005'::uuid, '${ORG_A}', '${INDIV_A}', 1000, 'REVERSE_CHARGE', 'EU', 0, 'CZK', 1000, 0, '1')`,
      ),
    ).rejects.toThrow(/partial_record_commodity_code_rc_chk|commodity_code/i)
  })
})

// ===========================================================================
// [I10] Provenance atomicity — the DB rollback PRIMITIVE the invariant relies
// on. (NOT an end-to-end proof of the gate; read this header before trusting
// what it covers.)
//
// The invariant (constitution I4/I10): "every gated write inserts one
// tool_call_log row inside the SAME withOrganization tx as the domain write,"
// so a booking can never exist without its provenance row. The GATE that
// actually CO-LOCATES the two writes lives in apps/api — see
// `apps/api/src/v1/accounting/accounting-writes.gate.ts`
// `runGatedWriteWithSeams` (~L242-399): it wraps `writeToolCallLog` +
// `opts.run` inside ONE `withOrganization` callback. That co-location is
// currently guarded ONLY by (i) the structural gate test
// (`apps/api/src/v1/accounting/accounting-writes.gate.test.ts`), which MOCKS
// `withOrganization` (`fn => fn({})`) and so cannot exercise a real COMMIT,
// and (ii) the `OrgTx` type, which forces `opts.run` onto the same bound tx
// handle. An end-to-end DB proof of the gate's co-location would need a
// real-Postgres harness inside apps/api (none exists today; packages/db must
// not import apps/api, which would invert the package boundary) — so it is out
// of scope for this packages/db suite.
//
// What THIS describe proves is the DB rollback PRIMITIVE the invariant leans
// on: a tool_call_log INSERT and a posting INSERT issued in ONE transaction
// either BOTH commit or BOTH roll back — INCLUDING when the failure is the
// DEFERRED R4 balance trigger firing at COMMIT (the subtle case, where a naive
// "log in its own tx, commit, then post" design would leak an orphan
// provenance row). It does NOT, on its own, prove that `runGatedWrite`
// co-locates the two writes; the gate + the `OrgTx` type above cover that half.
// ===========================================================================
describe("[I10] provenance-atomicity DB primitive (tool_call_log + posting commit/rollback together)", () => {
  it("(P1) a tool_call_log row and a posting in ONE tx commit together — the happy-path primitive", async () => {
    const postingId = "00000000-0000-0000-0000-0000000079a1"
    const idempotencyKey = `i10-happy-${Date.now()}`
    const logId = await admin.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.organization_id', '${ORG_A}', true)`,
      )
      const [log] = await tx.unsafe<Array<{ id: string }>>(`
        INSERT INTO tool_call_log (organization_id, tool_name, idempotency_key, actor_kind, user_id, input_json)
        VALUES ('${ORG_A}', 'createAccountingPosting', '${idempotencyKey}', 'ai_on_behalf', '${USER}', '{"x": 1}'::jsonb)
        RETURNING id
      `)
      await tx.unsafe(`
        INSERT INTO posting (id, organization_id, period_id, regime_code, summary_record_id, accounting_event_id, posting_date, posting_kind, responsible_user_id, posted_at)
        VALUES ('${postingId}', '${ORG_A}', '${PERIOD_A}', 'DOUBLE_ENTRY', '${DOC_A}', '${EVENT_A}', '2025-04-05', 'SIMPLE', '${USER}', now())
      `)
      await tx.unsafe(`
        INSERT INTO posting_double_entry_line (id, organization_id, posting_id, period_id, regime_code, account_id, side, amount)
        VALUES ('00000000-0000-0000-0000-0000000079a2', '${ORG_A}', '${postingId}', '${PERIOD_A}', 'DOUBLE_ENTRY', '${ACC_311}', 'DEBIT', 700)
      `)
      await tx.unsafe(`
        INSERT INTO posting_double_entry_line (id, organization_id, posting_id, period_id, regime_code, account_id, side, amount)
        VALUES ('00000000-0000-0000-0000-0000000079a3', '${ORG_A}', '${postingId}', '${PERIOD_A}', 'DOUBLE_ENTRY', '${ACC_321}', 'CREDIT', 700)
      `)
      if (!log) throw new Error("tool_call_log insert failed")
      return log.id
    })

    const [postingRow] = await admin.unsafe<Array<{ id: string }>>(
      `SELECT id FROM posting WHERE id = '${postingId}'::uuid`,
    )
    expect(postingRow?.id).toBe(postingId)
    const [logRow] = await admin.unsafe<Array<{ id: string }>>(
      `SELECT id FROM tool_call_log WHERE id = '${logId}'::uuid`,
    )
    expect(logRow?.id).toBe(logId)
  })

  it("(P2) a tool_call_log row + an UNBALANCED posting in ONE tx roll back together when the deferred R4 trigger fails at COMMIT (the DB primitive I10 leans on)", async () => {
    const postingId = "00000000-0000-0000-0000-0000000079b1"
    const idempotencyKey = `i10-rollback-${Date.now()}`
    await expect(
      admin.begin(async (tx) => {
        await tx.unsafe(
          `SELECT set_config('app.organization_id', '${ORG_A}', true)`,
        )
        await tx.unsafe(`
          INSERT INTO tool_call_log (organization_id, tool_name, idempotency_key, actor_kind, user_id, input_json)
          VALUES ('${ORG_A}', 'createAccountingPosting', '${idempotencyKey}', 'ai_on_behalf', '${USER}', '{"x": 1}'::jsonb)
        `)
        await tx.unsafe(`
          INSERT INTO posting (id, organization_id, period_id, regime_code, summary_record_id, accounting_event_id, posting_date, posting_kind, responsible_user_id, posted_at)
          VALUES ('${postingId}', '${ORG_A}', '${PERIOD_A}', 'DOUBLE_ENTRY', '${DOC_A}', '${EVENT_A}', '2025-04-06', 'SIMPLE', '${USER}', now())
        `)
        // This is a HAND-WRITTEN admin.begin() tx, NOT runGatedWrite — it
        // proves the DB rollback primitive, not the gate's co-location (see the
        // describe header). Unbalanced lines (1000 debit vs 1 credit): the R4
        // DEFERRED trigger fires AT COMMIT, rolling back the WHOLE transaction,
        // including the tool_call_log insert above — so a design that committed
        // the log in a separate tx would leak an orphan provenance row here.
        await tx.unsafe(`
          INSERT INTO posting_double_entry_line (id, organization_id, posting_id, period_id, regime_code, account_id, side, amount)
          VALUES ('00000000-0000-0000-0000-0000000079b2', '${ORG_A}', '${postingId}', '${PERIOD_A}', 'DOUBLE_ENTRY', '${ACC_311}', 'DEBIT', 1000)
        `)
        await tx.unsafe(`
          INSERT INTO posting_double_entry_line (id, organization_id, posting_id, period_id, regime_code, account_id, side, amount)
          VALUES ('00000000-0000-0000-0000-0000000079b3', '${ORG_A}', '${postingId}', '${PERIOD_A}', 'DOUBLE_ENTRY', '${ACC_321}', 'CREDIT', 1)
        `)
      }),
    ).rejects.toThrow(/unbalanced/)

    const [postingRow] = await admin.unsafe<Array<{ id: string }>>(
      `SELECT id FROM posting WHERE id = '${postingId}'::uuid`,
    )
    expect(postingRow).toBeUndefined()
    const [logRow] = await admin.unsafe<Array<{ id: string }>>(
      `SELECT id FROM tool_call_log WHERE idempotency_key = '${idempotencyKey}'`,
    )
    expect(logRow).toBeUndefined()
  })
})
