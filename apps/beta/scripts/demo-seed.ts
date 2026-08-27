/**
 * Seed the beta portal's demo organization.
 *
 *   DATABASE_URL=postgres://… pnpm --filter beta db:seed:demo
 *
 * WHAT IT WRITES. One small Czech construction s.r.o. — `Stavby Novák s.r.o.`,
 * plátce DPH, seven people — with every module of the portal populated from the
 * same set of facts: documents and the Zpracování queue, filings across all four
 * Daně families, the derived Dluhy read-model, published Výkazy / Předvaha /
 * Saldokonto / Payroll batches for the fiscal year to date, Partneři, Majetek,
 * Úvěry, Účty a hotovost, client tasks, and an employee seat.
 *
 * WHAT MAKES IT A *DEMO* AND NOT A FIXTURE. `demo-seed-plan.ts` derives the
 * whole firm from one date, `DEMO_ANCHOR`, so the seed does not rot: run it
 * again in six months and the firm moves with it, its newest published period
 * still being the month just ended — which is the one state spec §0.4 renders
 * without a staleness band. This file is only the writer.
 *
 * IDEMPOTENT BY WIPE-AND-RESEED, not by upsert. The demo organization is deleted
 * and rebuilt on every run: `DELETE FROM organization` cascades through every
 * org-scoped table, so a re-run cannot leave last run's rows behind and a table
 * added by a later migration is covered without editing this file. Upserting
 * instead would need a stable natural key on twenty tables that do not have one,
 * and would silently accumulate. NOTHING OUTSIDE THE DEMO ORG IS TOUCHED — the
 * delete is keyed on the demo slug and the four demo e-mail addresses.
 *
 * PASSWORDS are hashed with `better-auth/crypto`'s own `hashPassword`, the
 * function Better Auth's credential provider verifies against, so the seeded
 * accounts sign in through the ordinary door. The app's auth module is not
 * imported: it begins with `import "server-only"`, which a plain Node script
 * cannot load.
 *
 * NO SECOND FACTOR IS SEEDED. `BETA_TOTP_REQUIRED` gates the forced-enrolment
 * mandate and is off by default (Hleb's beta call), so all four accounts sign in
 * with a password alone. If that gate is ever switched on for this deployment,
 * the office accounts will be sent to `/zabezpeceni` to enrol — correct product
 * behaviour, not a gap in this seed.
 *
 * KNOWN GAP — S3. This writes database rows only. `document` rows point at
 * storage keys with no object behind them, so preview and download will 404 for
 * seeded documents until the bytes are uploaded separately. Everything else in
 * the portal renders from the database and is unaffected.
 */
/* eslint-disable turbo/no-undeclared-env-vars -- an ops script, not a cached turbo task */
import { createHash } from "node:crypto"
import { pathToFileURL } from "node:url"
import { hashPassword } from "better-auth/crypto"
import postgres from "postgres"

import {
  addMonths,
  atHour,
  auditDemoPlan,
  buildDemoPlan,
  DEMO_ANCHOR,
  dicOf,
  monthEnd,
  monthStart,
  periodKeyOf,
  numericString,
  type DemoPlan,
  type PeriodRef,
} from "./demo-seed-plan"

const DEFAULT_PASSWORD = "Afframe-Demo-Heslo"

type Sql = postgres.Sql<Record<string, never>>
type Tx = postgres.TransactionSql<Record<string, never>>

export type SeedCounts = Record<string, number>

/** A stable 64-hex digest for a seeded artefact. */
function digestOf(...parts: readonly string[]): string {
  return createHash("sha256").update(parts.join(":"), "utf8").digest("hex")
}

/** The digest, shaped as a UUID — `document_storage_key_shape` wants one. */
function uuidFromDigest(digest: string): string {
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    digest.slice(12, 16),
    digest.slice(16, 20),
    digest.slice(20, 32),
  ].join("-")
}

/**
 * Every period anything in the plan points at.
 *
 * Collected from the plan rather than listed by hand: a filing, a task or a
 * payslip that names a period the seed forgot to create would fail on
 * `filing_period_fk`, and the set is derivable, so it is derived.
 */
function periodsOf(plan: DemoPlan): PeriodRef[] {
  const seen = new Map<string, PeriodRef>()
  const add = (period: PeriodRef | null) => {
    if (period) seen.set(periodKeyOf(period), period)
  }

  for (const month of plan.months) add(month.period)
  for (const filing of plan.filings) add(filing.period)
  for (const task of plan.tasks) add(task.sourcePeriod)
  for (const document of plan.documents) add(document.payslipPeriod)
  add({
    kind: "month",
    year: plan.currentMonth.year,
    month: plan.currentMonth.month,
  })

  return [...seen.values()]
}

/** Remove the demo organization and its four accounts, if a previous run left them. */
export async function wipeDemo(sql: Sql | Tx, plan: DemoPlan): Promise<void> {
  await sql`DELETE FROM organization WHERE slug = ${plan.organization.slug}`
  await sql`
    DELETE FROM app_user
     WHERE email = ANY(${plan.users.map((user) => user.email)})
  `
}

export async function seedDemo(
  sql: Sql,
  options: { anchor?: string; password?: string } = {},
): Promise<{ plan: DemoPlan; counts: SeedCounts; problems: string[] }> {
  const plan = buildDemoPlan(options.anchor ?? DEMO_ANCHOR)
  const password = options.password ?? DEFAULT_PASSWORD
  const passwordHash = await hashPassword(password)
  const counts: SeedCounts = {}
  const bump = (table: string, by = 1) => {
    counts[table] = (counts[table] ?? 0) + by
  }

  await sql.begin(async (tx) => {
    await wipeDemo(tx, plan)

    // -- identity ---------------------------------------------------------
    const org = plan.organization
    const [organizationRow] = await tx<{ id: string }[]>`
      INSERT INTO organization (
        slug, legal_name, ico, dic, vat_regime, vat_registered_from,
        registered_street, registered_house_number, registered_orientation_number,
        registered_city, registered_postal_code, registered_country_code,
        data_box_id, court_file_number, tax_office_code,
        bank_account_prefix, bank_account_number, bank_code, iban,
        contact_email, contact_phone, is_demo, ares_fetched_at
      ) VALUES (
        ${org.slug}, ${org.legalName}, ${org.ico}, ${org.dic}, 'platce',
        ${org.vatRegisteredFrom},
        ${org.street}, ${org.houseNumber}, ${org.orientationNumber},
        ${org.city}, ${org.postalCode}, 'CZ',
        ${org.dataBoxId}, ${org.courtFileNumber}, ${org.taxOfficeCode},
        ${org.bankAccountPrefix}, ${org.bankAccountNumber}, ${org.bankCode},
        ${org.iban},
        ${org.contactEmail}, ${org.contactPhone}, true,
        ${atHour(plan.months[0]?.publishedOn ?? plan.today, 9, 0)}
      )
      RETURNING id
    `
    const organizationId = organizationRow!.id
    bump("organization")

    const userIds = new Map<string, string>()
    for (const user of plan.users) {
      const [row] = await tx<{ id: string }[]>`
        INSERT INTO app_user (email, name, is_staff, email_verified, locale)
        VALUES (${user.email}, ${user.name}, ${user.isStaff}, true, 'cs')
        RETURNING id
      `
      userIds.set(user.key, row!.id)
      bump("app_user")

      await tx`
        INSERT INTO auth_account (user_id, account_id, provider_id, password)
        VALUES (${row!.id}, ${row!.id}, 'credential', ${passwordHash})
      `
      bump("auth_account")
    }

    const ownerId = userIds.get("ucetni")!
    for (const user of plan.users) {
      await tx`
        INSERT INTO organization_membership
          (organization_id, user_id, role, active, invited_by_user_id)
        VALUES (
          ${organizationId}, ${userIds.get(user.key)!}, ${user.role}, true,
          ${user.role === "owner" ? null : ownerId}
        )
      `
      bump("organization_membership")
    }

    // -- reporting periods -------------------------------------------------
    const periodIds = new Map<string, string>()
    for (const period of periodsOf(plan)) {
      const [row] = await tx<{ id: string }[]>`
        INSERT INTO reporting_period (organization_id, period_kind, year, month, quarter)
        VALUES (
          ${organizationId}, ${period.kind}, ${period.year},
          ${period.kind === "month" ? period.month : null},
          ${period.kind === "quarter" ? period.quarter : null}
        )
        RETURNING id
      `
      periodIds.set(periodKeyOf(period), row!.id)
      bump("reporting_period")
    }
    const periodIdOf = (period: PeriodRef): string =>
      periodIds.get(periodKeyOf(period))!

    // -- registers the imports point at ------------------------------------
    const partnerIds = new Map<string, string>()
    for (const partner of plan.partners) {
      const [row] = await tx<{ id: string }[]>`
        INSERT INTO partner (
          organization_id, name, ico, dic, partner_role, source,
          street, house_number, city, postal_code, country_code, ares_fetched_at
        ) VALUES (
          ${organizationId}, ${partner.name}, ${partner.ico},
          ${dicOf(partner.ico)}, ${partner.role}, ${partner.source},
          ${partner.street}, ${partner.houseNumber}, ${partner.city},
          ${partner.postalCode}, 'CZ',
          ${partner.source === "saldokonto" ? atHour(plan.today, 6, 30) : null}
        )
        RETURNING id
      `
      partnerIds.set(partner.key, row!.id)
      bump("partner")
    }

    const employeeIds = new Map<string, string>()
    for (const employee of plan.employees) {
      const startedOn = monthStart(
        addMonths(plan.yearStart, -employee.startedMonthsBefore),
      )
      const endedOn =
        employee.endedMonthsAfter === null
          ? null
          : monthEnd(addMonths(plan.yearStart, employee.endedMonthsAfter))
      const appUserId =
        employee.appUserKey === null
          ? null
          : (userIds.get(employee.appUserKey) ?? null)

      const [row] = await tx<{ id: string }[]>`
        INSERT INTO payroll_employee (
          organization_id, full_name, contract_type, started_on, ended_on,
          active, app_user_id
        ) VALUES (
          ${organizationId}, ${employee.fullName}, ${employee.contract},
          ${startedOn}, ${endedOn}, ${endedOn === null}, ${appUserId}
        )
        RETURNING id
      `
      employeeIds.set(employee.key, row!.id)
      bump("payroll_employee")
    }

    // -- import batches, one per dataset per published month ----------------
    //
    // Every payload table carries `…_requires_draft_batch`: rows may only be
    // written under a batch that is still `draft`. So each batch is opened as a
    // draft, filled, and only then published — which is the same order the
    // office agent's publish call uses (spec §3.2), not a shortcut around it.
    for (const month of plan.months) {
      const periodId = periodIdOf(month.period)
      const publishedAt = atHour(month.publishedOn, 18, 20)

      const openBatch = async (
        dataset: string,
        rowCount: number,
      ): Promise<string> => {
        const [row] = await tx<{ id: string }[]>`
          INSERT INTO import_batch (
            organization_id, period_id, dataset, status, source,
            row_count, imported_by_user_id, imported_at, created_at, updated_at
          ) VALUES (
            ${organizationId}, ${periodId}, ${dataset}, 'draft', 'agent',
            ${rowCount}, ${ownerId}, ${publishedAt}, ${publishedAt}, ${publishedAt}
          )
          RETURNING id
        `
        return row!.id
      }

      const publishBatch = async (batchId: string) => {
        await tx`
          UPDATE import_batch
             SET status = 'published',
                 published_at = ${publishedAt},
                 published_by_user_id = ${ownerId}
           WHERE id = ${batchId}
        `
        bump("import_batch")
        await tx`
          INSERT INTO activity_log (
            organization_id, actor_kind, actor_user_id, action, entity_kind,
            entity_id, summary, created_at
          ) VALUES (
            ${organizationId}, 'user', ${ownerId}, 'import.publish',
            'import_batch', ${batchId}, ${tx.json({ source: "agent" })},
            ${publishedAt}
          )
        `
        bump("activity_log")
      }

      // Rozvaha — aktiva and pasiva ride in one batch, as one statement.
      const rozvahaRows = [
        ...month.rozvahaAktiva.map((row) => ({ kind: "rozvaha_aktiva", row })),
        ...month.rozvahaPasiva.map((row) => ({ kind: "rozvaha_pasiva", row })),
      ]
      const rozvahaId = await openBatch("rozvaha", rozvahaRows.length)
      await tx`
        INSERT INTO statement_line ${tx(
          rozvahaRows.map(({ kind, row }, index) => ({
            organization_id: organizationId,
            import_batch_id: rozvahaId,
            statement_kind: kind,
            period_id: periodId,
            ozn: row.ozn,
            row_code: row.rowCode,
            row_label: row.label,
            sort_order: index,
            indent: row.indent,
            is_bold: row.bold,
            // `statement_line_column_shape`: aktiva carries the brutto trio,
            // pasiva and VZZ carry the běžné/minulé pair. Never both.
            value_brutto:
              kind === "rozvaha_aktiva" ? numericString(row.gross ?? 0) : null,
            value_korekce:
              kind === "rozvaha_aktiva"
                ? numericString(row.adjustment ?? 0)
                : null,
            value_netto:
              kind === "rozvaha_aktiva" ? numericString(row.current) : null,
            value_bezne:
              kind === "rozvaha_aktiva" ? null : numericString(row.current),
            value_minule: numericString(row.prior),
          })),
        )}
      `
      bump("statement_line", rozvahaRows.length)
      await publishBatch(rozvahaId)

      const vzzId = await openBatch("vzz", month.vzz.length)
      await tx`
        INSERT INTO statement_line ${tx(
          month.vzz.map((row, index) => ({
            organization_id: organizationId,
            import_batch_id: vzzId,
            statement_kind: "vzz",
            period_id: periodId,
            ozn: row.ozn,
            row_code: row.rowCode,
            row_label: row.label,
            sort_order: index,
            indent: row.indent,
            is_bold: row.bold,
            value_brutto: null,
            value_korekce: null,
            value_netto: null,
            value_bezne: numericString(row.current),
            value_minule: numericString(row.prior),
          })),
        )}
      `
      bump("statement_line", month.vzz.length)
      await publishBatch(vzzId)

      const predvahaId = await openBatch("predvaha", month.predvaha.length)
      await tx`
        INSERT INTO trial_balance_line ${tx(
          month.predvaha.map((row) => ({
            organization_id: organizationId,
            import_batch_id: predvahaId,
            period_id: periodId,
            account_code: row.accountCode,
            account_name: row.accountName,
            opening_balance: numericString(row.opening),
            turnover_debit: numericString(row.debit),
            turnover_credit: numericString(row.credit),
            closing_balance: numericString(row.closing),
          })),
        )}
      `
      bump("trial_balance_line", month.predvaha.length)
      await publishBatch(predvahaId)

      const saldoId = await openBatch("saldokonto", month.saldokonto.length)
      await tx`
        INSERT INTO partner_saldo ${tx(
          month.saldokonto.map((row) => ({
            organization_id: organizationId,
            import_batch_id: saldoId,
            partner_id: partnerIds.get(row.partnerKey)!,
            period_id: periodId,
            receivable_total:
              row.receivable === null ? null : numericString(row.receivable),
            payable_total:
              row.payable === null ? null : numericString(row.payable),
            oldest_due: row.oldestDue,
          })),
        )}
      `
      bump("partner_saldo", month.saldokonto.length)
      await publishBatch(saldoId)

      const payroll = month.close.payroll
      const payrollId = await openBatch("payroll", payroll.lines.length + 1)
      await tx`
        INSERT INTO payroll_summary (
          organization_id, import_batch_id, period_id,
          gross_total, employer_social, employer_health, employer_cost_total,
          employee_withholdings_total, income_tax_advance, net_paid_total,
          payment_due_date, headcount_hpp, headcount_dpc, headcount_dpp
        ) VALUES (
          ${organizationId}, ${payrollId}, ${periodId},
          ${numericString(payroll.grossTotal)},
          ${numericString(payroll.employerSocial)},
          ${numericString(payroll.employerHealth)},
          ${numericString(payroll.employerCostTotal)},
          ${numericString(payroll.withholdingsTotal)},
          ${numericString(payroll.incomeTaxAdvance)},
          ${numericString(payroll.netPaidTotal)},
          ${month.payrollDueOn},
          ${payroll.headcountHpp}, ${payroll.headcountDpc},
          ${payroll.headcountDpp}
        )
      `
      bump("payroll_summary")
      await tx`
        INSERT INTO payroll_employee_line ${tx(
          payroll.lines.map((line) => ({
            organization_id: organizationId,
            import_batch_id: payrollId,
            payroll_employee_id: employeeIds.get(line.employeeKey)!,
            period_id: periodId,
            gross: numericString(line.gross),
            deductions_total: numericString(line.deductions),
            net: numericString(line.net),
            employer_cost: numericString(line.employerCost),
          })),
        )}
      `
      bump("payroll_employee_line", payroll.lines.length)
      await publishBatch(payrollId)
    }

    // -- Účty a hotovost ---------------------------------------------------
    // `account_balance_map_no_overlap` refuses one code that is a prefix of
    // another, so this book is mapped at synthetic-account granularity only.
    for (const [index, entry] of [
      { code: "211", label: "Pokladna", kind: "cash" },
      { code: "221", label: "Běžný účet KB", kind: "bank" },
    ].entries()) {
      await tx`
        INSERT INTO account_balance_map (
          organization_id, account_code, match_kind, friendly_label, kind,
          sort_order, active
        ) VALUES (
          ${organizationId}, ${entry.code}, 'exact', ${entry.label},
          ${entry.kind}, ${index}, true
        )
      `
      bump("account_balance_map")
    }

    // -- Majetek -----------------------------------------------------------
    for (const asset of plan.assets) {
      const card = plan.assetCards.find((entry) => entry.key === asset.key)!
      const inService = card.inServiceOn
      const disposedOn = card.disposedOn
      const depreciation = card.accumulatedDepreciation

      const [row] = await tx<{ id: string }[]>`
        INSERT INTO asset (
          organization_id, name, category, is_minor, acquisition_cost,
          acquired_on, placed_in_service_on, accumulated_depreciation,
          depreciation_as_of, site_ref, status, disposed_on
        ) VALUES (
          ${organizationId}, ${asset.name}, ${asset.category}, ${asset.isMinor},
          ${numericString(asset.cost)}, ${inService}, ${inService},
          ${depreciation === null ? null : numericString(depreciation)},
          ${card.depreciationAsOf},
          ${asset.site}, ${disposedOn === null ? "in_use" : "disposed"},
          ${disposedOn}
        )
        RETURNING id
      `
      bump("asset")

      await tx`
        INSERT INTO asset_event (organization_id, asset_id, kind, event_date, amount, note)
        VALUES (
          ${organizationId}, ${row!.id}, 'put_into_service', ${inService},
          ${numericString(asset.cost)}, 'Zařazení do užívání.'
        )
      `
      bump("asset_event")

      if (asset.improvement !== null && card.improvedOn !== null) {
        await tx`
          INSERT INTO asset_event (organization_id, asset_id, kind, event_date, amount, note)
          VALUES (
            ${organizationId}, ${row!.id}, 'improvement',
            ${card.improvedOn},
            ${numericString(asset.improvement.cost)},
            'Technické zhodnocení — rozšíření o dvě pole.'
          )
        `
        bump("asset_event")
      }

      if (disposedOn !== null) {
        await tx`
          INSERT INTO asset_event (organization_id, asset_id, kind, event_date, amount, note)
          VALUES (
            ${organizationId}, ${row!.id}, 'disposal', ${disposedOn}, NULL,
            'Vyřazeno, plně odepsáno.'
          )
        `
        bump("asset_event")
      }
    }

    // -- Úvěry a leasingy --------------------------------------------------
    for (const loan of plan.loans) {
      const card = plan.loanCards.find((entry) => entry.key === loan.key)!
      await tx`
        INSERT INTO loan (
          organization_id, institution, loan_kind, principal, balance,
          balance_as_of, installment, installment_period, interest_rate_pct,
          ends_on, note_client
        ) VALUES (
          ${organizationId}, ${loan.institution}, ${loan.kind},
          ${numericString(loan.principal)}, ${numericString(card.balance)},
          ${card.balanceAsOf}, ${numericString(loan.installment)},
          'monthly', ${loan.interestRatePct},
          ${card.endsOn}, ${loan.note}
        )
      `
      bump("loan")
    }

    // -- Daně a podání -----------------------------------------------------
    for (const filing of plan.filings) {
      await tx`
        INSERT INTO filing (
          organization_id, kind, period_id, due_on, status, filed_on,
          amount_due, paid_at, variable_symbol, note_client
        ) VALUES (
          ${organizationId}, ${filing.kind}, ${periodIdOf(filing.period)},
          ${filing.dueOn}, ${filing.status}, ${filing.filedOn},
          ${filing.amountDue === null ? null : numericString(filing.amountDue)},
          ${filing.paidAt}, ${filing.variableSymbol}, ${filing.noteClient}
        )
      `
      bump("filing")
    }

    for (const liability of plan.liabilities) {
      await tx`
        INSERT INTO liability (
          organization_id, creditor_group, label, amount, due_on, paid_at,
          variable_symbol, note_client
        ) VALUES (
          ${organizationId}, ${liability.creditorGroup}, ${liability.label},
          ${numericString(liability.amount)}, ${liability.dueOn},
          ${liability.paidAt}, ${liability.variableSymbol},
          ${liability.noteClient}
        )
      `
      bump("liability")
    }

    // -- Úkoly klientovi ---------------------------------------------------
    const taskIds = new Map<string, string>()
    for (const task of [...plan.tasks].sort(
      (left, right) => Number(right.isTemplate) - Number(left.isTemplate),
    )) {
      const [row] = await tx<{ id: string }[]>`
        INSERT INTO client_task (
          organization_id, is_template, title, description, due_date,
          template_due_day, link_kind, status, done_at, source_template_id,
          source_period_id, created_by
        ) VALUES (
          ${organizationId}, ${task.isTemplate}, ${task.title},
          ${task.description}, ${task.dueDate}, ${task.templateDueDay},
          ${task.linkKind}, ${task.status}, ${task.doneAt},
          ${task.sourceTemplateKey === null ? null : taskIds.get(task.sourceTemplateKey)!},
          ${task.sourcePeriod === null ? null : periodIdOf(task.sourcePeriod)},
          ${ownerId}
        )
        RETURNING id
      `
      taskIds.set(task.key, row!.id)
      bump("client_task")
    }

    // -- Dokumenty ---------------------------------------------------------
    for (const document of plan.documents) {
      const digest = digestOf(
        "afframe-beta-demo",
        plan.organization.slug,
        document.key,
      )
      const storageKey = `org/${organizationId}/${uuidFromDigest(digest)}.${document.extension}`
      await tx`
        INSERT INTO document (
          organization_id, doc_type, status, original_filename, storage_key,
          content_type, extension, byte_size, sha256, document_date, amount,
          site_ref, partner_id, office_message, internal_note,
          visible_to_client, payslip_employee_id, payslip_period_id,
          uploaded_by_user_id, created_at, updated_at
        ) VALUES (
          ${organizationId}, ${document.docType}, ${document.status},
          ${document.filename}, ${storageKey}, ${document.contentType},
          ${document.extension}, ${document.byteSize}, ${digest},
          ${document.documentDate},
          ${document.amount === null ? null : numericString(document.amount)},
          ${document.site},
          ${document.partnerKey === null ? null : partnerIds.get(document.partnerKey)!},
          ${document.officeMessage}, ${document.internalNote}, true,
          ${document.payslipEmployeeKey === null ? null : employeeIds.get(document.payslipEmployeeKey)!},
          ${document.payslipPeriod === null ? null : periodIdOf(document.payslipPeriod)},
          ${document.uploadedByKey === null ? null : userIds.get(document.uploadedByKey)!},
          ${document.createdAt}, ${document.createdAt}
        )
      `
      bump("document")
    }
  })

  return { plan, counts, problems: auditDemoPlan(plan) }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function isDirectRun(): boolean {
  const entry = process.argv[1]
  return !!entry && import.meta.url === pathToFileURL(entry).href
}

function assertWritableTarget(url: string): void {
  const local = new Set(["localhost", "127.0.0.1", "::1", "[::1]"])
  const hostname = (() => {
    try {
      return new URL(url).hostname
    } catch {
      return ""
    }
  })()
  if (local.has(hostname)) return
  if (process.env.BETA_DEMO_SEED_ALLOW_REMOTE === "true") {
    console.warn(
      `[demo-seed] WARNING: seeding the REMOTE database at "${hostname}". ` +
        "The demo organization there will be deleted and rebuilt.",
    )
    return
  }
  console.error(
    `[demo-seed] refusing to seed: DATABASE_URL host "${hostname}" is not local. ` +
      "Set BETA_DEMO_SEED_ALLOW_REMOTE=true to override.",
  )
  process.exit(1)
}

if (isDirectRun()) {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error("[demo-seed] DATABASE_URL is not set.")
    process.exit(1)
  }
  assertWritableTarget(url)

  const anchor = process.env.BETA_DEMO_SEED_ANCHOR ?? DEMO_ANCHOR
  const password = process.env.BETA_DEMO_SEED_PASSWORD ?? DEFAULT_PASSWORD

  const sql = postgres(url, { max: 1, onnotice: () => {} })
  try {
    const { plan, counts, problems } = await seedDemo(sql, { anchor, password })

    console.log(`[demo-seed] anchored on ${plan.anchor}`)
    console.log(
      `[demo-seed] ${plan.organization.legalName} (/${plan.organization.slug}) — ` +
        `${plan.months.length} published month(s), newest ${String(plan.lastClosed.month).padStart(2, "0")}/${plan.lastClosed.year}`,
    )
    for (const [table, count] of Object.entries(counts).sort()) {
      console.log(`  ${String(count).padStart(5)}  ${table}`)
    }

    console.log("\n[demo-seed] accounts (same password for all):")
    for (const user of plan.users) {
      console.log(
        `  ${user.role.padEnd(6)}  ${user.email.padEnd(28)} ${user.name}`,
      )
    }
    console.log(`  password: ${password}`)

    if (problems.length > 0) {
      console.error(
        `\n[demo-seed] FRESHNESS AUDIT FAILED — ${problems.length} problem(s):`,
      )
      for (const problem of problems) console.error(`  - ${problem}`)
      process.exitCode = 1
    } else {
      console.log("\n[demo-seed] freshness audit clean.")
    }
  } finally {
    await sql.end({ timeout: 5 })
  }
}
