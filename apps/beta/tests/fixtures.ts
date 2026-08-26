/**
 * Shared seed builders for the beta suites.
 *
 * The tenancy tests need the same world every time — two organizations, one
 * account per role in each, a live session for each of them — and every later
 * PR that adds an org-scoped surface needs the same world plus its own rows.
 * Building it here once means a new route's cross-org case costs three lines in
 * a spec file instead of a fresh fixture.
 *
 * Accounts are given their credential through Better Auth's internal adapter,
 * the same call the setup-link consume makes (`lib/auth/setup-token.ts`). The
 * link flow itself — the only door in production — is tested end to end in
 * `lib/auth/setup-token.test.ts`; reproducing it here would make every fixture
 * pay for a token round trip to reach the same row.
 */
import postgres from "postgres"

import type {
  BetaClientTaskLinkKind,
  BetaDocumentType,
  BetaFilingKind,
  BetaFilingStatus,
  BetaImportDataset,
  BetaImportSource,
  BetaImportStatus,
  BetaObligationGroup,
  BetaOrgRole,
  BetaPeriodKind,
  BetaStatementKind,
  BetaVatRegime,
} from "@/db/schema"

import { sharedDatabaseUrl, unique } from "./scratch-db"

// Must be set before `lib/auth/server` is evaluated, which is why every import
// of it below is dynamic.
process.env["BETTER_AUTH_SECRET"] ??= `beta-test-secret-${"x".repeat(40)}`
process.env["BETTER_AUTH_URL"] ??= "http://localhost:3200"

const PASSWORD = "Beta-Heslo-2026!"

let client: postgres.Sql | undefined

function db(): postgres.Sql {
  client ??= postgres(sharedDatabaseUrl(), { max: 6, onnotice: () => {} })
  return client
}

/** Call from `afterAll`. */
export async function endFixtures(): Promise<void> {
  if (!client) return
  await client.end({ timeout: 5 })
  client = undefined
}

export type TestAccount = {
  userId: string
  email: string
  isStaff: boolean
  /** Request headers carrying this account's live session cookie. */
  headers: Headers
}

export type TestOrganization = {
  organizationId: string
  slug: string
  /** One signed-in account per role. The owner is office staff, as the DB requires. */
  members: Record<BetaOrgRole, TestAccount>
}

/** Headers for a visitor with no session at all. */
export function anonymousHeaders(): Headers {
  return new Headers()
}

/**
 * Headers carrying a session cookie under Better Auth's DEFAULT name — what
 * the main product sets for `.afframe.com`, which physically reaches this host
 * (Advisor blocker B4-2). Beta must treat it as noise.
 */
export function foreignCookieHeaders(value: string): Headers {
  return new Headers({ cookie: `__Secure-better-auth.session_token=${value}` })
}

export async function createAccount(
  options: { staff?: boolean; email?: string } = {},
): Promise<TestAccount> {
  const sql = db()
  const email = options.email ?? `${unique("user")}@example.com`
  const isStaff = options.staff ?? false

  const [row] = await sql<{ id: string }[]>`
    INSERT INTO app_user (email, name, is_staff)
    VALUES (${email}, 'Testovací uživatel', ${isStaff})
    RETURNING id
  `
  const userId = row!.id

  const { betaAuth } = await import("@/lib/auth/server")
  const ctx = await betaAuth().$context
  await ctx.internalAdapter.linkAccount({
    userId,
    providerId: "credential",
    accountId: userId,
    password: await ctx.password.hash(PASSWORD),
  })

  return { userId, email, isStaff, headers: await signIn(email) }
}

/** A live session for `email`, as request headers. */
async function signIn(email: string): Promise<Headers> {
  const { betaAuth } = await import("@/lib/auth/server")
  const { BETA_SESSION_COOKIE_NAME } = await import("@/lib/auth/policy")

  const response = await betaAuth().api.signInEmail({
    body: { email, password: PASSWORD },
    asResponse: true,
  })
  const cookie = response.headers
    .getSetCookie()
    .find((c) => c.startsWith(BETA_SESSION_COOKIE_NAME))
  if (!cookie) throw new Error(`fixture: no session cookie for ${email}`)

  return new Headers({ cookie: cookie.split(";")[0]! })
}

/** The raw token value inside a session cookie header, for negative tests. */
export function sessionTokenOf(headers: Headers): string {
  const cookie = headers.get("cookie") ?? ""
  return cookie.slice(cookie.indexOf("=") + 1)
}

export async function createOrganization(
  options: {
    slug?: string
    archived?: boolean
    isDemo?: boolean
    vatRegime?: BetaVatRegime
  } = {},
): Promise<{ organizationId: string; slug: string }> {
  const sql = db()
  const slug = options.slug ?? unique("org-")
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO organization (slug, legal_name, is_demo, vat_regime, archived_at)
    VALUES (
      ${slug},
      'Testovací s.r.o.',
      ${options.isDemo ?? false},
      ${options.vatRegime ?? "neplatce"},
      ${options.archived ? sql`now()` : null}
    )
    RETURNING id
  `
  return { organizationId: row!.id, slug }
}

export async function addMembership(
  organizationId: string,
  userId: string,
  role: BetaOrgRole,
  options: { active?: boolean } = {},
): Promise<void> {
  const sql = db()
  await sql`
    INSERT INTO organization_membership (organization_id, user_id, role, active)
    VALUES (${organizationId}, ${userId}, ${role}, ${options.active ?? true})
  `
}

/**
 * An organization with one signed-in account per role.
 *
 * The owner is created with `is_staff` because the DB trigger
 * `organization_membership_owner_requires_staff` refuses an owner membership
 * for anyone else — owner-ness can only originate from the office.
 */
export async function seedOrganization(
  options: { slug?: string; vatRegime?: BetaVatRegime } = {},
): Promise<TestOrganization> {
  const { organizationId, slug } = await createOrganization(options)

  const roles: BetaOrgRole[] = ["owner", "admin", "member", "guest"]
  const entries = await Promise.all(
    roles.map(async (role) => {
      const account = await createAccount({ staff: role === "owner" })
      await addMembership(organizationId, account.userId, role)
      return [role, account] as const
    }),
  )

  return {
    organizationId,
    slug,
    members: Object.fromEntries(entries) as Record<BetaOrgRole, TestAccount>,
  }
}

export async function archiveOrganization(
  organizationId: string,
): Promise<void> {
  await db()`UPDATE organization SET archived_at = now() WHERE id = ${organizationId}`
}

export async function disableAccount(userId: string): Promise<void> {
  await db()`UPDATE app_user SET disabled_at = now() WHERE id = ${userId}`
}

export async function setMembershipActive(
  organizationId: string,
  userId: string,
  active: boolean,
): Promise<void> {
  await db()`
    UPDATE organization_membership SET active = ${active}
     WHERE organization_id = ${organizationId} AND user_id = ${userId}
  `
}

export async function setStaff(
  userId: string,
  isStaff: boolean,
): Promise<void> {
  await db()`UPDATE app_user SET is_staff = ${isStaff} WHERE id = ${userId}`
}

// ---------------------------------------------------------------------------
// Filing registry (PR 16) — periods and filings, written as raw SQL
// ---------------------------------------------------------------------------
//
// Deliberately NOT routed through `lib/data/reporting-periods.ts` /
// `lib/data/filings.ts`. Those are the office write path and they are
// owner-gated; a fixture that used them could not seed a world for a test whose
// subject IS the gate, and every read test would then be asserting against rows
// its own subject wrote. Raw SQL seeds the world; the modules are what is under
// test.

export async function createReportingPeriod(
  organizationId: string,
  period: {
    kind: BetaPeriodKind
    year: number
    month?: number | null
    quarter?: number | null
  },
): Promise<string> {
  const [row] = await db()<{ id: string }[]>`
    INSERT INTO reporting_period (organization_id, period_kind, year, month, quarter)
    VALUES (
      ${organizationId},
      ${period.kind},
      ${period.year},
      ${period.month ?? null},
      ${period.quarter ?? null}
    )
    RETURNING id
  `
  return row!.id
}

/** A month period for the organization, unique per call so seeds never collide. */
let periodMonth = 0
export async function createMonthPeriod(
  organizationId: string,
  year = 2026,
): Promise<string> {
  periodMonth = (periodMonth % 12) + 1
  return createReportingPeriod(organizationId, {
    kind: "month",
    year,
    month: periodMonth,
  })
}

/**
 * A `document` row, written straight to SQL.
 *
 * The upload path (`lib/data/documents.ts`) is PR 10's and needs an S3 store;
 * the filing suite only ever needs a row to point at, so it writes one. The
 * storage key is composed in SQL because `document_storage_key_shape` requires
 * it to be two UUIDs AND to start with this organization's own id.
 */
export async function createDocumentRow(
  organizationId: string,
  values: {
    docType?: BetaDocumentType
    visibleToClient?: boolean
    deleted?: boolean
    payslipPeriodId?: string | null
  } = {},
): Promise<string> {
  const sql = db()
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO document (
      organization_id, doc_type, original_filename, storage_key,
      content_type, extension, byte_size, sha256, visible_to_client,
      payslip_period_id, deleted_at
    )
    VALUES (
      ${organizationId},
      ${values.docType ?? "other"},
      'potvrzeni.pdf',
      'org/' || ${organizationId}::text || '/' || gen_random_uuid()::text || '.pdf',
      'application/pdf',
      'pdf',
      1024,
      md5(random()::text) || md5(random()::text),
      ${values.visibleToClient ?? true},
      ${values.payslipPeriodId ?? null},
      ${values.deleted ? sql`now()` : null}
    )
    RETURNING id
  `
  return row!.id
}

/** Hard-delete a document row, as PR 37's retention purge eventually will. */
export async function hardDeleteDocument(documentId: string): Promise<void> {
  await db()`DELETE FROM document WHERE id = ${documentId}`
}

/** Soft-delete a document row, as the office's own delete does. */
export async function softDeleteDocument(documentId: string): Promise<void> {
  await db()`UPDATE document SET deleted_at = now() WHERE id = ${documentId}`
}

export async function attachDocumentToFiling(
  filingId: string,
  documentId: string | null,
): Promise<void> {
  await db()`UPDATE filing SET document_id = ${documentId} WHERE id = ${filingId}`
}

// ---------------------------------------------------------------------------
// Import spine (PR 23) — batches and payload rows, written as raw SQL
// ---------------------------------------------------------------------------
//
// Same reasoning as the filing seeds above: `lib/data/imports.ts` is the office
// write path and it is owner-gated, so a fixture that used it could not seed the
// world for a test whose subject IS the gate — and every read test would then be
// asserting against rows its own subject wrote.
//
// `createImportBatchRow` can seed a PUBLISHED batch directly, which the write
// path deliberately cannot do in one step. That is the point: a read test that
// needs a published rozvaha should not have to replay the publish ritual to get
// one, and a publish test should not be able to hide a bug behind the fixture
// that seeded it.

export async function createImportBatchRow(
  organizationId: string,
  periodId: string,
  values: {
    dataset?: BetaImportDataset
    status?: BetaImportStatus
    source?: BetaImportSource
    filename?: string | null
    rowCount?: number
    noteInternal?: string | null
    importedByUserId?: string | null
  } = {},
): Promise<string> {
  const sql = db()
  const status = values.status ?? "draft"
  const source = values.source ?? "agent"

  const [row] = await sql<{ id: string }[]>`
    INSERT INTO import_batch (
      organization_id, period_id, dataset, status, source, filename,
      row_count, note_internal, imported_by_user_id, published_at
    )
    VALUES (
      ${organizationId},
      ${periodId},
      ${values.dataset ?? "rozvaha"},
      ${status},
      ${source},
      ${source === "manual" ? (values.filename ?? "predvaha.csv") : null},
      ${values.rowCount ?? 0},
      ${values.noteInternal ?? null},
      ${values.importedByUserId ?? null},
      ${status === "draft" ? null : sql`now()`}
    )
    RETURNING id
  `
  return row!.id
}

/**
 * A statement line, straight to SQL.
 *
 * The five value columns default to NULL rather than to zero: a blank cell on a
 * statutory form is not a zero, and a fixture that quietly filled them would
 * make the column-shape CHECK untestable.
 */
export async function createStatementLineRow(
  organizationId: string,
  batchId: string,
  periodId: string,
  values: {
    statementKind?: BetaStatementKind
    ozn?: string | null
    rowCode?: string
    rowLabel?: string
    sortOrder?: number
    indent?: number
    isBold?: boolean
    brutto?: string | null
    korekce?: string | null
    netto?: string | null
    bezne?: string | null
    minule?: string | null
  } = {},
): Promise<string> {
  const [row] = await db()<{ id: string }[]>`
    INSERT INTO statement_line (
      organization_id, import_batch_id, period_id, statement_kind, ozn,
      row_code, row_label, sort_order, indent, is_bold,
      value_brutto, value_korekce, value_netto, value_bezne, value_minule
    )
    VALUES (
      ${organizationId},
      ${batchId},
      ${periodId},
      ${values.statementKind ?? "rozvaha_aktiva"},
      ${values.ozn ?? null},
      ${values.rowCode ?? "001"},
      ${values.rowLabel ?? "AKTIVA CELKEM"},
      ${values.sortOrder ?? 1},
      ${values.indent ?? 0},
      ${values.isBold ?? false},
      ${values.brutto ?? null},
      ${values.korekce ?? null},
      ${values.netto ?? null},
      ${values.bezne ?? null},
      ${values.minule ?? null}
    )
    RETURNING id
  `
  return row!.id
}

export async function createTrialBalanceLineRow(
  organizationId: string,
  batchId: string,
  periodId: string,
  values: {
    accountCode?: string
    accountName?: string
    openingBalance?: string | null
    turnoverDebit?: string | null
    turnoverCredit?: string | null
    closingBalance?: string | null
  } = {},
): Promise<string> {
  const [row] = await db()<{ id: string }[]>`
    INSERT INTO trial_balance_line (
      organization_id, import_batch_id, period_id, account_code, account_name,
      opening_balance, turnover_debit, turnover_credit, closing_balance
    )
    VALUES (
      ${organizationId},
      ${batchId},
      ${periodId},
      ${values.accountCode ?? "221"},
      ${values.accountName ?? "Bankovní účty"},
      ${values.openingBalance ?? null},
      ${values.turnoverDebit ?? null},
      ${values.turnoverCredit ?? null},
      ${values.closingBalance ?? null}
    )
    RETURNING id
  `
  return row!.id
}

/** The raw status of a batch, for asserting on state the projections hide. */
export async function readImportBatchRow(batchId: string): Promise<{
  status: BetaImportStatus
  published_at: Date | null
  superseded_at: Date | null
  superseded_by_batch_id: string | null
  row_count: number
}> {
  const [row] = await db()<
    {
      status: BetaImportStatus
      published_at: Date | null
      superseded_at: Date | null
      superseded_by_batch_id: string | null
      row_count: number
    }[]
  >`
    SELECT status, published_at, superseded_at, superseded_by_batch_id, row_count
      FROM import_batch WHERE id = ${batchId}
  `
  if (!row) throw new Error(`fixture: no import_batch ${batchId}`)
  return row
}

export async function createFilingRow(
  organizationId: string,
  periodId: string,
  values: {
    kind?: BetaFilingKind
    status?: BetaFilingStatus
    /** ISO date, or a signed day offset from today (negative = already overdue). */
    dueOn?: string
    dueInDays?: number
    filedOn?: string | null
    amountDue?: string | null
    paidAt?: Date | null
    variableSymbol?: string | null
    noteClient?: string | null
    noteInternal?: string | null
  } = {},
): Promise<string> {
  const sql = db()
  const dueOn =
    values.dueOn ??
    (values.dueInDays === undefined
      ? "2026-03-25"
      : new Date(Date.now() + values.dueInDays * 86_400_000)
          .toISOString()
          .slice(0, 10))

  const [row] = await sql<{ id: string }[]>`
    INSERT INTO filing (
      organization_id, kind, period_id, due_on, status, filed_on,
      amount_due, paid_at, variable_symbol, note_client, note_internal
    )
    VALUES (
      ${organizationId},
      ${values.kind ?? "dph_priznani"},
      ${periodId},
      ${dueOn},
      ${values.status ?? "planned"},
      ${values.filedOn ?? null},
      ${values.amountDue ?? null},
      ${values.paidAt ?? null},
      ${values.variableSymbol ?? null},
      ${values.noteClient ?? null},
      ${values.noteInternal ?? null}
    )
    RETURNING id
  `
  return row!.id
}

// ---------------------------------------------------------------------------
// Manual liabilities (PR 18) — the obligations read model's third source
// ---------------------------------------------------------------------------
//
// Raw SQL for the same reason `createFilingRow` is: `lib/data/liabilities.ts` is
// the owner-gated write path, and a fixture that used it could not seed a world
// for the tests whose subject IS the gate.

export async function createLiabilityRow(
  organizationId: string,
  values: {
    group?: BetaObligationGroup
    label?: string
    amount?: string
    /** ISO date, or a signed day offset from today (negative = already overdue). */
    dueOn?: string
    dueInDays?: number
    paidAt?: Date | null
    variableSymbol?: string | null
    noteClient?: string | null
    noteInternal?: string | null
  } = {},
): Promise<string> {
  const dueOn =
    values.dueOn ??
    (values.dueInDays === undefined
      ? "2026-03-31"
      : new Date(Date.now() + values.dueInDays * 86_400_000)
          .toISOString()
          .slice(0, 10))

  const [row] = await db()<{ id: string }[]>`
    INSERT INTO liability (
      organization_id, creditor_group, label, amount, due_on,
      paid_at, variable_symbol, note_client, note_internal
    )
    VALUES (
      ${organizationId},
      ${values.group ?? "ostatni"},
      ${values.label ?? "Zbytkovy zavazek"},
      ${values.amount ?? "1000.00"},
      ${dueOn},
      ${values.paidAt ?? null},
      ${values.variableSymbol ?? null},
      ${values.noteClient ?? null},
      ${values.noteInternal ?? null}
    )
    RETURNING id
  `
  return row!.id
}

// ---------------------------------------------------------------------------
// client_task (PR 19) — written as raw SQL, same reasoning as the fixtures
// above: the office write path (`lib/data/client-tasks.ts`) is owner-gated,
// so a fixture that used it could not seed a world for a test whose subject
// IS the gate.
// ---------------------------------------------------------------------------

export async function createClientTaskRow(
  organizationId: string,
  values: {
    title?: string
    description?: string | null
    dueDate?: string
    linkKind?: BetaClientTaskLinkKind
    status?: "open" | "done"
    doneAt?: Date | null
    sourceTemplateId?: string | null
    sourcePeriodId?: string | null
  } = {},
): Promise<string> {
  const [row] = await db()<{ id: string }[]>`
    INSERT INTO client_task (
      organization_id, is_template, title, description, due_date, link_kind,
      status, done_at, source_template_id, source_period_id
    )
    VALUES (
      ${organizationId},
      false,
      ${values.title ?? "Nahrát bankovní výpis"},
      ${values.description ?? null},
      ${values.dueDate ?? "2026-03-25"},
      ${values.linkKind ?? "none"},
      ${values.status ?? "open"},
      ${values.doneAt ?? null},
      ${values.sourceTemplateId ?? null},
      ${values.sourcePeriodId ?? null}
    )
    RETURNING id
  `
  return row!.id
}

export async function createClientTaskTemplateRow(
  organizationId: string,
  values: {
    title?: string
    description?: string | null
    templateDueDay?: number
    linkKind?: BetaClientTaskLinkKind
  } = {},
): Promise<string> {
  const [row] = await db()<{ id: string }[]>`
    INSERT INTO client_task (
      organization_id, is_template, title, description, template_due_day,
      link_kind
    )
    VALUES (
      ${organizationId},
      true,
      ${values.title ?? "Doklady za měsíc"},
      ${values.description ?? null},
      ${values.templateDueDay ?? 5},
      ${values.linkKind ?? "none"}
    )
    RETURNING id
  `
  return row!.id
}
