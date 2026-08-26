import "server-only"

import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm"

import type { AnyPgColumn } from "drizzle-orm/pg-core"

import { betaDb, type BetaExecutor } from "@/db/client"
import {
  import_batch,
  payroll_employee,
  payroll_employee_line,
  payroll_summary,
  reporting_period,
  type BetaPayrollContractType,
} from "@/db/schema"

import {
  payrollEmployeeLineView,
  payrollEmployeeView,
  payrollSummaryView,
  reportingPeriodView,
  type PayrollEmployeeLineView,
  type PayrollEmployeeView,
  type PayrollSummaryView,
  type ReportingPeriodView,
} from "./projections"
import type { OrgScope, OwnerScope } from "./scope"

/**
 * Mzdy — the employee register and the payroll dataset (spec §2.6, §2.6.1, §5).
 *
 * WHAT THIS MODULE READS. `payroll_summary` and `payroll_employee_line` are
 * PAYLOAD TABLES of the `payroll` import batch (migration 0016), so "the payroll
 * for 07/2026" means "the payload of the PUBLISHED payroll batch of 07/2026" —
 * exactly what `publishedBatchFor` means for a rozvaha. Every read below joins
 * through `import_batch` with `status = 'published'` IN THE WHERE CLAUSE, which
 * is the whole of "a draft payroll is never served": the office has to be able to
 * stage a correction without an employee watching their own net pay change.
 *
 * IT COMPUTES NOTHING (spec §0.2). There is no SUM, no headcount COUNT(*) and no
 * gross-minus-withholdings anywhere in this file. Every figure is the office's,
 * read as stored — including `net_paid_total`, which is arithmetically close to
 * several other columns and is nonetheless taken as given, because it is the
 * number the client will find on their own bank statement. (`assets.ts` computes
 * `zůstatková cena` in SQL because spec §0.2 names that one subtraction as
 * allowed; no payroll figure has such a licence.)
 *
 * ==========================================================================
 * VISIBILITY: `payrollScope()` IS THE ONE GATE, AND ITS SEAM
 * ==========================================================================
 *
 * Spec §2.6.1: "One `payrollScope()` function drives every payroll query: all /
 * {employeeId} / none." Two of the three arms exist today and both are real:
 *
 *   all   — a MANAGEMENT SEAT (owner / admin / member). Spec §5: "Management
 *           seats ... all client modules + all payroll incl. every payslip."
 *   none  — an UNLINKED GUEST. §2.6.1 makes an unlinked guest an external
 *           viewer, and §5 grants own-payroll only to a guest WITH an employee
 *           link. Salary is the one dataset in this product where the honest
 *           default for "not established" is nothing at all, so this arm
 *           fails closed and every read below short-circuits on it WITHOUT
 *           touching the database.
 *
 * THE SEAM POINT, NAMED. The employee seat (spec §2.6.1) adds the third arm.
 * When it lands: `resolveOrgScope` carries a resolved `payrollEmployeeId` on
 * `OrgScope` (its own header already describes that LEFT JOIN), `PayrollScope`
 * gains `{ kind: "employee"; employeeId }`, `payrollScope()` returns it for a
 * guest that has one, and `employeeFilter()` below returns
 * `eq(payroll_employee.id, visibility.employeeId)` for it. That is the whole
 * change, and `employeeFilter`'s `never` arm makes the compiler demand it.
 *
 * No read below has to be revisited, because none of them writes its own
 * employee filter, and no read can be ADDED that forgets one, because
 * `employeeFilter` is the only thing that produces the conjunct.
 *
 * There is no speculative third arm here today. `PayrollScope` is a union of the
 * two cases that exist, so widening it is a compile error in exactly the place
 * that must be revisited.
 *
 * WRITES ARE OWNER-ONLY, by parameter type (`OwnerScope`), the same brand
 * `documents-office.ts` established. The agent ingestion API mints an
 * `OwnerScope` through `resolveAgentOwnerScope`, so it reaches the same writes
 * and no others.
 */

// ---------------------------------------------------------------------------
// The visibility gate
// ---------------------------------------------------------------------------

export type PayrollScope =
  /** Management seat — every employee, every period (spec §5). */
  | { readonly kind: "all" }
  /** Unlinked guest — nothing. Fails closed; see the module header. */
  | { readonly kind: "none" }

/**
 * Which payroll rows this scope may see.
 *
 * The role test is here and nowhere else. A read that wants to know "may this
 * caller see payroll" asks this function; a read that wants to FILTER by it
 * passes the result to `employeeFilter`.
 */
export function payrollScope(scope: OrgScope): PayrollScope {
  return scope.role === "guest" ? { kind: "none" } : { kind: "all" }
}

/**
 * The employee-identity conjunct every read over `payroll_employee` and
 * `payroll_employee_line` ANDs into its WHERE clause. THE SEAM POINT.
 *
 * `undefined` is drizzle's "no condition" — a management seat filters on tenancy
 * alone. The `none` arm returns a FALSE predicate rather than `undefined`:
 * every read short-circuits before it gets here, so this is defence in depth,
 * and the direction of that defence matters — a read added later that forgets
 * the early return returns nothing instead of everyone's salary.
 *
 * THE `default` ARM IS WHY THIS IS A FUNCTION. Widening `PayrollScope` with the
 * employee seat's `{ kind: "employee"; employeeId }` makes the `never`
 * assignment below a COMPILE ERROR, here, in the one place that must then return
 * `eq(payroll_employee.id, visibility.employeeId)`. Every read below picks that
 * up without being touched, and no read can be written that forgets it, because
 * none of them builds its own employee filter.
 */
function employeeFilter(visibility: PayrollScope): SQL | undefined {
  switch (visibility.kind) {
    case "all":
      return undefined
    case "none":
      return sql`false`
    default: {
      const unreachable: never = visibility
      return unreachable
    }
  }
}

// ---------------------------------------------------------------------------
// Shared joins
// ---------------------------------------------------------------------------

/** The period join, carrying tenancy for the same reason `imports.ts` does. */
const batchPeriodJoin = and(
  eq(reporting_period.id, import_batch.period_id),
  eq(reporting_period.organization_id, import_batch.organization_id),
)

/**
 * "The published payroll batch of this organization", as a join condition.
 *
 * `status = 'published'` lives HERE rather than in each caller, so a draft
 * cannot reach a payroll surface by a read forgetting the filter. Composed with
 * `import_batch_one_published_idx`, it matches at most one batch per period.
 */
function publishedPayrollBatchJoin(
  scope: OrgScope,
  batchIdColumn: AnyPgColumn,
) {
  return and(
    eq(import_batch.id, batchIdColumn),
    eq(import_batch.organization_id, scope.organizationId),
    eq(import_batch.dataset, "payroll"),
    eq(import_batch.status, "published"),
  )
}

// ---------------------------------------------------------------------------
// Reads — Přehled mezd
// ---------------------------------------------------------------------------

/**
 * The payroll totals of ONE period, or `null` when the office has published none
 * (spec §2.6 Přehled mezd).
 *
 * `null` is the honest answer §0.4 requires — the surface renders "zatím nebylo
 * nahráno" rather than reaching for an older month or footing zeroes.
 *
 * NOT NARROWED BY THE EMPLOYEE SEAT, and deliberately: company-wide payroll
 * totals are not an employee's own payroll. `payrollScope` gates the whole read
 * instead — an unlinked guest gets `null`, and when the employee-seat arm lands
 * it will get `null` here too (its surface is Moje mzda, not Přehled mezd),
 * which is why this read tests the scope KIND rather than adding a predicate.
 */
export async function payrollSummaryForPeriod(
  scope: OrgScope,
  periodId: string,
): Promise<PayrollSummaryView | null> {
  if (payrollScope(scope).kind !== "all") return null

  const [row] = await betaDb()
    .select({
      id: payroll_summary.id,
      period_id: payroll_summary.period_id,
      gross_total: payroll_summary.gross_total,
      employer_social: payroll_summary.employer_social,
      employer_health: payroll_summary.employer_health,
      employer_cost_total: payroll_summary.employer_cost_total,
      employee_withholdings_total: payroll_summary.employee_withholdings_total,
      income_tax_advance: payroll_summary.income_tax_advance,
      net_paid_total: payroll_summary.net_paid_total,
      payment_due_date: payroll_summary.payment_due_date,
      headcount_hpp: payroll_summary.headcount_hpp,
      headcount_dpc: payroll_summary.headcount_dpc,
      headcount_dpp: payroll_summary.headcount_dpp,
      note_client: payroll_summary.note_client,
    })
    .from(payroll_summary)
    .innerJoin(
      import_batch,
      publishedPayrollBatchJoin(scope, payroll_summary.import_batch_id),
    )
    .where(
      and(
        eq(payroll_summary.organization_id, scope.organizationId),
        eq(payroll_summary.period_id, periodId),
      ),
    )
    .limit(1)

  return row ? payrollSummaryView(row) : null
}

/**
 * Every period this organization has a PUBLISHED payroll batch for, newest
 * first — the month picker of spec §2.6, and the axis of its 12-month trend.
 *
 * The same shape and the same reasoning as `publishedPeriodsForDataset`: a
 * picker built from the organization's period list would offer months that
 * answer "zatím nebylo nahráno", which is §0.4's honest empty state used as a
 * dead end rather than as information.
 */
export async function publishedPayrollPeriods(
  scope: OrgScope,
): Promise<ReportingPeriodView[]> {
  if (payrollScope(scope).kind !== "all") return []

  const rows = await betaDb()
    .select({
      id: reporting_period.id,
      period_kind: reporting_period.period_kind,
      year: reporting_period.year,
      month: reporting_period.month,
      quarter: reporting_period.quarter,
      starts_on: reporting_period.starts_on,
      ends_on: reporting_period.ends_on,
    })
    .from(import_batch)
    .innerJoin(reporting_period, batchPeriodJoin)
    .where(
      and(
        eq(import_batch.organization_id, scope.organizationId),
        eq(import_batch.dataset, "payroll"),
        eq(import_batch.status, "published"),
      ),
    )
    .orderBy(desc(reporting_period.ends_on))

  return rows.map(reportingPeriodView)
}

// ---------------------------------------------------------------------------
// Reads — Zaměstnanci
// ---------------------------------------------------------------------------

export type PayrollEmployeeFilter = {
  /** Omit to list everyone, ended employees included. */
  readonly active?: boolean
}

/**
 * The employee register (spec §2.6 Zaměstnanci).
 *
 * EVERYONE BY DEFAULT, ended employees included. Spec §2.6.1 makes the leaver's
 * deactivation deliberate and manual ("never automatic — leaver needs last
 * payslip"), so a register that hid ended rows would hide exactly the ones the
 * office is being asked to act on — the "Zaměstnanec ukončen, účet aktivní"
 * warning is computed from `endedOn` + `hasPortalAccount`, both of which this
 * read carries, and neither of which is reachable if the row is filtered out.
 *
 * Ordered active-first then by name: the register's working set is the people
 * currently on the payroll, and leavers are the tail rather than an interleave.
 */
export async function payrollEmployeesForScope(
  scope: OrgScope,
  filter: PayrollEmployeeFilter = {},
): Promise<PayrollEmployeeView[]> {
  const visibility = payrollScope(scope)
  if (visibility.kind === "none") return []

  const rows = await betaDb()
    .select({
      id: payroll_employee.id,
      full_name: payroll_employee.full_name,
      contract_type: payroll_employee.contract_type,
      started_on: payroll_employee.started_on,
      ended_on: payroll_employee.ended_on,
      active: payroll_employee.active,
      app_user_id: payroll_employee.app_user_id,
      updated_at: payroll_employee.updated_at,
    })
    .from(payroll_employee)
    .where(
      and(
        eq(payroll_employee.organization_id, scope.organizationId),
        filter.active === undefined
          ? undefined
          : eq(payroll_employee.active, filter.active),
        employeeFilter(visibility),
      ),
    )
    .orderBy(
      desc(payroll_employee.active),
      asc(payroll_employee.full_name),
      asc(payroll_employee.id),
    )

  return rows.map(payrollEmployeeView)
}

/**
 * Every employee line of ONE period — the Zaměstnanci month view (spec §2.6).
 *
 * Reads the payload of the published payroll batch, joined to the register for
 * the name. An employee with no line in that month simply has no row: an absent
 * line is not a zero salary (§0.4).
 */
export async function payrollLinesForPeriod(
  scope: OrgScope,
  periodId: string,
): Promise<PayrollEmployeeLineView[]> {
  const visibility = payrollScope(scope)
  if (visibility.kind === "none") return []

  const rows = await betaDb()
    .select(LINE_COLUMNS)
    .from(payroll_employee_line)
    .innerJoin(
      import_batch,
      publishedPayrollBatchJoin(scope, payroll_employee_line.import_batch_id),
    )
    .innerJoin(payroll_employee, employeeJoin)
    .where(
      and(
        eq(payroll_employee_line.organization_id, scope.organizationId),
        eq(payroll_employee_line.period_id, periodId),
        employeeFilter(visibility),
      ),
    )
    .orderBy(asc(payroll_employee.full_name), asc(payroll_employee.id))

  return rows.map(payrollEmployeeLineView)
}

/**
 * ONE employee's lines across every published period, newest first — the
 * per-employee history behind the Zaměstnanci row (spec §2.6), and the read the
 * employee seat's Moje mzda will run with its own id.
 *
 * `employeeId` is filtered TOGETHER with `organization_id`, so an id from
 * another book returns `[]` rather than a row — the same non-oracle answer
 * `requireScope` gives, at the row level.
 */
export async function payrollLinesForEmployee(
  scope: OrgScope,
  employeeId: string,
): Promise<PayrollEmployeeLineView[]> {
  const visibility = payrollScope(scope)
  if (visibility.kind === "none") return []

  const rows = await betaDb()
    .select(LINE_COLUMNS)
    .from(payroll_employee_line)
    .innerJoin(
      import_batch,
      publishedPayrollBatchJoin(scope, payroll_employee_line.import_batch_id),
    )
    .innerJoin(payroll_employee, employeeJoin)
    .innerJoin(reporting_period, linePeriodJoin)
    .where(
      and(
        eq(payroll_employee_line.organization_id, scope.organizationId),
        eq(payroll_employee_line.payroll_employee_id, employeeId),
        employeeFilter(visibility),
      ),
    )
    .orderBy(desc(reporting_period.ends_on))

  return rows.map(payrollEmployeeLineView)
}

const LINE_COLUMNS = {
  id: payroll_employee_line.id,
  payroll_employee_id: payroll_employee_line.payroll_employee_id,
  period_id: payroll_employee_line.period_id,
  gross: payroll_employee_line.gross,
  deductions_total: payroll_employee_line.deductions_total,
  net: payroll_employee_line.net,
  employer_cost: payroll_employee_line.employer_cost,
  full_name: payroll_employee.full_name,
}

/** Both halves of the composite FK, restated so a relaxed FK cannot leak here. */
const employeeJoin = and(
  eq(payroll_employee.id, payroll_employee_line.payroll_employee_id),
  eq(payroll_employee.organization_id, payroll_employee_line.organization_id),
)

const linePeriodJoin = and(
  eq(reporting_period.id, payroll_employee_line.period_id),
  eq(reporting_period.organization_id, payroll_employee_line.organization_id),
)

// ---------------------------------------------------------------------------
// Office writes — the employee register (spec §3.3)
// ---------------------------------------------------------------------------

export type PayrollEmployeeWriteInput = {
  readonly fullName: string
  readonly contractType: BetaPayrollContractType
  readonly startedOn?: string | null
  readonly endedOn?: string | null
  readonly active?: boolean
  /** The office payroll system's own id. Absent for a hand-typed row. */
  readonly externalRef?: string | null
}

/**
 * The employee an agent's `externalRef` names, or `null`.
 *
 * MATCHED ON `externalRef`, NEVER ON A NAME. Two employees can genuinely be
 * called Jan Novák, and one employee's name genuinely changes (marriage, a
 * corrected diacritic) — so name matching would silently merge two people in the
 * first case and duplicate one in the second. Both failure modes end with a
 * salary attributed to the wrong person, which is the worst outcome available in
 * this module. The source payroll system's own id is the only key that means
 * anything here, and the partial unique index is what makes a hand-typed row
 * (no `external_ref`) untouchable by any ingestion run.
 */
export async function payrollEmployeeByExternalRef(
  scope: OwnerScope,
  externalRef: string,
  executor: BetaExecutor = betaDb(),
): Promise<{ id: string } | null> {
  const [row] = await executor
    .select({ id: payroll_employee.id })
    .from(payroll_employee)
    .where(
      and(
        eq(payroll_employee.organization_id, scope.organizationId),
        eq(payroll_employee.external_ref, externalRef),
      ),
    )
    .limit(1)

  return row ?? null
}

export async function createPayrollEmployee(
  scope: OwnerScope,
  input: PayrollEmployeeWriteInput,
  executor: BetaExecutor = betaDb(),
): Promise<{ id: string }> {
  const [row] = await executor
    .insert(payroll_employee)
    .values({
      organization_id: scope.organizationId,
      full_name: input.fullName,
      contract_type: input.contractType,
      started_on: input.startedOn ?? null,
      ended_on: input.endedOn ?? null,
      active: input.active ?? true,
      external_ref: input.externalRef ?? null,
    })
    .returning({ id: payroll_employee.id })

  if (!row) throw new Error("payroll employee insert returned no row")
  return row
}

/**
 * Patch an employee's register fields.
 *
 * `app_user_id` IS NOT PATCHABLE HERE, and there is no overload that makes it
 * so. The employee seat's link is created by consuming a pre-bound setup token
 * (spec §2.6.1) in one transaction that also creates the account and the guest
 * membership; a general-purpose patch that could set it would let any owner-level
 * write path — including the office agent — bind an arbitrary portal account to
 * an employee row and hand that account someone's payslips. Binding an account
 * to a person is an identity act, not an accounting fact.
 *
 * `contractType` IS patchable, unlike a filing's `kind`: moving from DPP to HPP
 * is a real employment change the office records against the same person, not a
 * new person. `endedOn` and `active` are patched independently of each other,
 * for the reason the schema header gives.
 */
export type PayrollEmployeePatch = Partial<{
  fullName: string
  contractType: BetaPayrollContractType
  startedOn: string | null
  endedOn: string | null
  active: boolean
}>

export async function updatePayrollEmployee(
  scope: OwnerScope,
  employeeId: string,
  patch: PayrollEmployeePatch,
  executor: BetaExecutor = betaDb(),
): Promise<boolean> {
  const updated = await executor
    .update(payroll_employee)
    .set({
      ...(patch.fullName === undefined ? {} : { full_name: patch.fullName }),
      ...(patch.contractType === undefined
        ? {}
        : { contract_type: patch.contractType }),
      ...(patch.startedOn === undefined ? {} : { started_on: patch.startedOn }),
      ...(patch.endedOn === undefined ? {} : { ended_on: patch.endedOn }),
      ...(patch.active === undefined ? {} : { active: patch.active }),
    })
    .where(
      and(
        eq(payroll_employee.id, employeeId),
        eq(payroll_employee.organization_id, scope.organizationId),
      ),
    )
    .returning({ id: payroll_employee.id })

  return updated.length > 0
}
