import { notFound } from "next/navigation"

import { Card, CardContent } from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import type { BetaPayrollContractType } from "@/db/schema"
import type { BetaMessageKey } from "@/i18n/messages"
import { getBetaTranslations } from "@/i18n/translations-server"
import { managesPeople } from "@/lib/auth/invite-policy"
import {
  payrollEmployeesForScope,
  payrollLinesForPeriod,
  payrollScope,
  publishedPayrollPeriods,
} from "@/lib/data/payroll"
import { formatBetaDate } from "@/lib/format/date"
import { formatBetaMoney } from "@/lib/format/money"

import { resolveOrgScope } from "../../_lib/org-scope"
import { PeriodPicker } from "../_components/period-picker"
import { PERIOD_PARAM, selectPeriod } from "../_lib/period-selection"

import { EmployeeSeatInvite } from "./_components/employee-seat-invite"

const CONTRACT_TYPE_LABEL: Record<BetaPayrollContractType, BetaMessageKey> = {
  hpp: "mzdy.contractHpp",
  dpc: "mzdy.contractDpc",
  dpp: "mzdy.contractDpp",
}

/**
 * Zaměstnanci (spec §2.6): "employee register + per-employee monthly lines
 * (hrubá, srážky, čistá, náklad), month picker; import via uzávěrka payroll
 * dataset or manual. Management seats see all."
 *
 * READ-ONLY, MANAGEMENT SEATS ONLY. `mzdy/layout.tsx` already refuses every
 * other role before a browser reaches this page; the `payrollScope` check is
 * repeated here for the same reason `mzdy/page.tsx` repeats it — a page-level
 * test calls this function directly, and the gate that answers a definitive
 * 404 must be provable on its own terms.
 *
 * THE REGISTER, NOT THE MONTH, DRIVES THE ROW LIST. Every employee this
 * organization has ever had — leavers included, spec §2.6.1's "ended_on and
 * active are independent facts" — renders one row; the period picker narrows
 * only the FOUR FIGURE COLUMNS, joined in memory against
 * `payrollLinesForPeriod`'s small per-period list. An employee with no line
 * in the chosen month is not a zero (§0.4): every figure cell renders the
 * same "Neuvedeno" `Přehled mezd` already uses for an absent total, never a
 * blank that could be misread as 0 Kč.
 *
 * ONE WRITE LIVES HERE, AND IT IS NOT AN EDIT (PR 33): the employee-seat invite
 * of spec §2.6.1, which §2.10 places on Mzdy rather than on Nastavení › Lidé
 * ("employee-seat invites from Mzdy"). It belongs on the register because the
 * register row IS the argument — the invite binds an account to THIS
 * `payroll_employee`, and no other surface in the application knows which row is
 * meant. The control renders per row, only for a viewer who manages people
 * (`managesPeople`, spec §5 — a `member` reads the register but hands out
 * nothing) and only where the person has no portal account yet; the action
 * re-derives both verdicts server-side.
 *
 * THE LEAVER WARNING (§2.6.1: "`ended_on` set ⇒ Pro účetní warning 'Zaměstnanec
 * ukončen, účet aktivní'"). Rendered here, next to the row it is about, because
 * this is the register the office reads — and NEVER as an automatic
 * deactivation, which §2.6.1 forbids in the same sentence ("never automatic —
 * leaver needs last payslip"). The seat stays live until somebody decides;
 * deactivating it is Nastavení › Lidé's `setMemberActive`, where every other
 * membership write already lives and where the ceiling is already enforced.
 *
 * EDITING THE REGISTER IS NOT THIS PAGE'S JOB. `payroll.ts` already exposes
 * `createPayrollEmployee` / `updatePayrollEmployee` (owner-only writes), but
 * spec's own §3.3 form list for Pro účetní › Zadávání dat does not name
 * `payroll_employee` yet — building an edit affordance here would be inventing
 * a workflow the spec has not placed. This page stays read-only, the same
 * depth spec's own map gives every OTHER Mzdy leaf.
 */
export default async function ZamestnanciPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ [PERIOD_PARAM]?: string }>
}) {
  const { orgSlug } = await params
  const requested = (await searchParams)[PERIOD_PARAM]

  const scope = await resolveOrgScope(orgSlug)
  if (payrollScope(scope).kind !== "all") notFound()

  // The invite COLUMN's visibility, decided once for the page. `managesPeople`
  // is the same predicate `peopleForScope` and `nastaveniNavFor` consult, so
  // "who may hand out access" has one answer across the application rather than
  // a payroll-flavoured second opinion.
  const managesSeats = managesPeople({
    kind: "organization",
    role: scope.role,
  })

  const [t, employees, periods] = await Promise.all([
    getBetaTranslations(),
    payrollEmployeesForScope(scope),
    publishedPayrollPeriods(scope),
  ])
  const period = selectPeriod(periods, requested)
  const lines = period ? await payrollLinesForPeriod(scope, period.id) : []
  const lineByEmployee = new Map(lines.map((line) => [line.employeeId, line]))

  const basePath = `/${orgSlug}/mzdy/zamestnanci`
  const notStated = t("mzdy.amountNotStated")
  const money = (value: string | null | undefined) =>
    (value ? formatBetaMoney(value) : null) ?? notStated

  return (
    <div className="grid gap-4">
      <h1 className="font-heading text-lg font-semibold">
        {t("mzdy.zamestnanciTitle")}
      </h1>

      {periods.length > 0 ? (
        <PeriodPicker basePath={basePath} periods={periods} current={period} />
      ) : null}

      {employees.length === 0 ? (
        <Card>
          <CardContent className="grid gap-1 py-10 text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              {t("mzdy.emptyHeading")}
            </p>
            <p>{t("mzdy.zamestnanciEmpty")}</p>
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("mzdy.zamestnanciColumnName")}</TableHead>
              <TableHead>{t("mzdy.zamestnanciColumnContract")}</TableHead>
              <TableHead>{t("mzdy.zamestnanciColumnStarted")}</TableHead>
              <TableHead>{t("mzdy.zamestnanciColumnEnded")}</TableHead>
              <TableHead className="text-right">
                {t("mzdy.zamestnanciColumnGross")}
              </TableHead>
              <TableHead className="text-right">
                {t("mzdy.zamestnanciColumnDeductions")}
              </TableHead>
              <TableHead className="text-right">
                {t("mzdy.zamestnanciColumnNet")}
              </TableHead>
              <TableHead className="text-right">
                {t("mzdy.zamestnanciColumnCost")}
              </TableHead>
              {managesSeats ? (
                <TableHead>{t("mzdy.zamestnanciColumnSeat")}</TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map((employee) => {
              const line = lineByEmployee.get(employee.id) ?? null
              return (
                <TableRow key={employee.id}>
                  <TableCell className="font-medium">
                    {employee.fullName}
                    {/* §2.6.1's leaver warning: the employment ended and the
                        portal account is still live. Both facts come off the
                        row that is already rendered — no extra read, and no
                        automatic consequence. */}
                    {employee.endedOn !== null && employee.hasPortalAccount ? (
                      <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                        {t("mzdy.seatEndedWarning")}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {t(CONTRACT_TYPE_LABEL[employee.contractType])}
                  </TableCell>
                  <TableCell>
                    {employee.startedOn
                      ? formatBetaDate(employee.startedOn)
                      : notStated}
                  </TableCell>
                  <TableCell>
                    {employee.endedOn ? formatBetaDate(employee.endedOn) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(line?.gross)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(line?.deductionsTotal)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(line?.net)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(line?.employerCost)}
                  </TableCell>
                  {managesSeats ? (
                    <TableCell>
                      {employee.hasPortalAccount ? (
                        <span className="text-xs text-muted-foreground">
                          {t("mzdy.seatLinked")}
                        </span>
                      ) : (
                        <EmployeeSeatInvite
                          orgSlug={orgSlug}
                          employeeId={employee.id}
                          employeeName={employee.fullName}
                        />
                      )}
                    </TableCell>
                  ) : null}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
