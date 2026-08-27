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
 * {employeeId} / none." All three arms exist as of PR 33:
 *
 *   all      — a MANAGEMENT SEAT (owner / admin / member). Spec §5: "Management
 *              seats ... all client modules + all payroll incl. every payslip."
 *   employee — the EMPLOYEE SEAT (spec §2.6.1): a `guest` membership whose
 *              account is linked to a `payroll_employee` row of this book. It
 *              sees that row and nothing else — not the company totals, not a
 *              colleague's line, not a colleague's payslip.
 *   none     — an UNLINKED GUEST. §2.6.1 makes an unlinked guest an external
 *              viewer, and §5 grants own-payroll only to a guest WITH an employee
 *              link. Salary is the one dataset in this product where the honest
 *              default for "not established" is nothing at all, so this arm
 *              fails closed and every read below short-circuits on it WITHOUT
 *              touching the database.
 *
 * THE SEAM HELD. Landing the third arm was two edits — this function and
 * `employeeFilter` — plus a deliberate decision, stated per read, about whether
 * a read is PER-EMPLOYEE data (narrow it) or COMPANY-WIDE data (refuse it
 * outright). No read invents its own employee predicate, and none can be added
 * that forgets one, because `employeeFilter` is the only thing that produces the
 * conjunct and its `never` arm is a compile error to omit.
 *
 * THE TWO KINDS OF READ, AND WHY BOTH EXIST. A company total is not "an
 * employee's payroll with a wider filter" — it is a different fact, and there is
 * no narrowing of `payroll_summary` that yields one person's share of it. So
 * reads over `payroll_summary` test the scope KIND and answer `null`/`[]` for
 * anything but `all`, while reads over `payroll_employee` /
 * `payroll_employee_line` pass the visibility to `employeeFilter` and are
 * narrowed. Each read below says which it is.
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
  /** Employee seat — exactly one `payroll_employee` row (spec §2.6.1). */
  | { readonly kind: "employee"; readonly employeeId: string }
  /** Unlinked guest — nothing. Fails closed; see the module header. */
  | { readonly kind: "none" }

/**
 * Which payroll rows this scope may see.
 *
 * The visibility test is here and nowhere else. A read that wants to know "may
 * this caller see payroll" asks this function; a read that wants to FILTER by it
 * passes the result to `employeeFilter`.
 *
 * THE MANAGEMENT ARM IS TESTED FIRST, and the order is load-bearing. A company
 * owner or a director who also draws a salary HAS a `payroll_employee` row, so
 * `scope.payrollEmployeeId` is non-null for them too — testing the link first
 * would silently narrow the person who is supposed to see the whole payroll to
 * their own line. Spec §5 is unambiguous ("Management seats ... all payroll incl.
 * every payslip"), and `isEmployeeSeat` (`scope.ts`) states the same conjunction
 * from the other side.
 */
export function payrollScope(scope: OrgScope): PayrollScope {
  if (scope.role !== "guest") return { kind: "all" }
  return scope.payrollEmployeeId === null
    ? { kind: "none" }
    : { kind: "employee", employeeId: scope.payrollEmployeeId }
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
 * THE `default` ARM IS WHY THIS IS A FUNCTION — and it did its job. Widening
 * `PayrollScope` with `{ kind: "employee"; employeeId }` in PR 33 made the
 * `never` assignment below a COMPILE ERROR here, in the one place that had to
 * grow a predicate, and every read picked the new conjunct up without being
 * touched. A future fourth arm gets the same treatment.
 *
 * THE EMPLOYEE ARM FILTERS ON `payroll_employee.id`, NOT ON
 * `payroll_employee_line.payroll_employee_id`. Both columns hold the same value
 * on a joined row, and the register table is the one every read here already
 * joins — but the choice matters for the read that lists the REGISTER
 * (`payrollEmployeesForScope`), where there is no line table at all. One column,
 * one conjunct, every read.
 */
function employeeFilter(visibility: PayrollScope): SQL | undefined {
  switch (visibility.kind) {
    case "all":
      return undefined
    case "employee":
      return eq(payroll_employee.id, visibility.employeeId)
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
 * A COMPANY-WIDE READ, so it is REFUSED for the employee seat rather than
 * narrowed (module header, "the two kinds of read"). There is no narrowing of a
 * company payroll total that yields one person's share of it: `gross_total` is
 * everybody's gross, `headcount_hpp` is a fact about the workforce, and
 * `payment_due_date` is when the employer pays the úřad. An employee's own
 * figures are `payroll_employee_line`, read by `payrollLinesForEmployee` below.
 * So this tests the scope KIND — `all`, or nothing.
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
 *
 * COMPANY-WIDE, so `all` only — the same call as `payrollSummaryForPeriod`
 * above, and for a sharper reason than it looks: this list is "the months this
 * employer ran payroll", which for an employee who joined in June would name
 * every month before they arrived. Moje mzda has no period picker at all; it
 * renders the months the employee's OWN lines exist for, carried on those rows
 * by `payrollLinesForEmployee`. An empty axis is the honest one here.
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
 *
 * NARROWED, NOT REFUSED, FOR THE EMPLOYEE SEAT. The register is per-employee
 * data, so `employeeFilter` cuts it to the caller's own row — which is exactly
 * what Moje mzda needs to render "Jan Novák, HPP, nástup 1. 3. 2025" without a
 * second query and without any read that could return a colleague. The
 * Zaměstnanci PAGE is still 404 for the seat (`assertNotEmployeeSeat`); this is
 * the data layer being narrow independently of which page calls it, which is the
 * property that survives somebody adding a page next month.
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
 * per-employee history behind the Zaměstnanci row (spec §2.6), and the read Moje
 * mzda (spec §2.6.1) runs with the seat's own id.
 *
 * THREE INDEPENDENT FENCES ON `employeeId`, and the redundancy is the point:
 *
 *   1. `organization_id = scope.organizationId` — an id from another book
 *      returns `[]` rather than a row, the same non-oracle answer `requireScope`
 *      gives, at the row level;
 *   2. `payroll_employee_id = employeeId` — the caller's request;
 *   3. `employeeFilter(visibility)` — the SEAT's own id, ANDed on top. For an
 *      employee seat, asking for a colleague's id yields `employee_id = <theirs>
 *      AND payroll_employee.id = <mine>`, which is empty. The caller cannot
 *      widen itself by passing a different argument, so Moje mzda passing
 *      `scope.payrollEmployeeId` is a convenience rather than the security
 *      boundary.
 *
 * IT CARRIES THE PERIOD, unlike `payrollLinesForPeriod` (whose caller already
 * knows which month it asked for). A history without month labels is unreadable,
 * and the `reporting_period` join is already here for the ordering — so the
 * columns come back on the row that is being read anyway rather than through a
 * second query per line.
 */
export async function payrollLinesForEmployee(
  scope: OrgScope,
  employeeId: string,
): Promise<PayrollEmployeeLineHistoryRow[]> {
  const visibility = payrollScope(scope)
  if (visibility.kind === "none") return []

  const rows = await betaDb()
    .select({ ...LINE_COLUMNS, ...PERIOD_COLUMNS })
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

  return rows.map((row) => ({
    ...payrollEmployeeLineView(row),
    // `id` on the row is the LINE's, so the period's own id is taken from
    // `period_id` — which `linePeriodJoin` has just equated to
    // `reporting_period.id`. Selecting `reporting_period.id` under a second
    // alias would be the same value read twice.
    period: reportingPeriodView({
      id: row.period_id,
      period_kind: row.period_kind,
      year: row.year,
      month: row.month,
      quarter: row.quarter,
      starts_on: row.starts_on,
      ends_on: row.ends_on,
    }),
  }))
}

/** One line plus the month it belongs to — see `payrollLinesForEmployee`. */
export type PayrollEmployeeLineHistoryRow = PayrollEmployeeLineView & {
  readonly period: ReportingPeriodView
}

const PERIOD_COLUMNS = {
  period_kind: reporting_period.period_kind,
  year: reporting_period.year,
  month: reporting_period.month,
  quarter: reporting_period.quarter,
  starts_on: reporting_period.starts_on,
  ends_on: reporting_period.ends_on,
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
