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
import {
  payrollEmployeesForScope,
  payrollLinesForEmployee,
  payrollScope,
} from "@/lib/data/payroll"
import { payslipDocumentsForScope } from "@/lib/data/payslips"
import { formatBetaDate } from "@/lib/format/date"
import { formatBetaMoney } from "@/lib/format/money"
import { formatReportingPeriodLabel } from "@/lib/format/period-label"

import { resolveOrgScope } from "../../_lib/org-scope"

const CONTRACT_TYPE_LABEL: Record<BetaPayrollContractType, BetaMessageKey> = {
  hpp: "mzdy.contractHpp",
  dpc: "mzdy.contractDpc",
  dpp: "mzdy.contractDpp",
}

/**
 * Moje mzda (spec §2.6.1) — the EMPLOYEE SEAT's only payroll page: "own lines +
 * payslips".
 *
 * WHO REACHES IT: `payrollScope(scope).kind === "employee"` and nobody else.
 * That is narrower than "not a management seat" in both directions and both are
 * deliberate:
 *
 *   - an UNLINKED GUEST gets 404 (`kind === "none"`), which `mzdy/layout.tsx`
 *     has already answered one level up;
 *   - a MANAGEMENT SEAT gets 404 too (`kind === "all"`), even one who is
 *     personally on the payroll. Their surface is Zaměstnanci, which shows every
 *     row including their own; a second page rendering the same rows under a
 *     different visibility rule would be a second implementation of "whose
 *     payroll is this" for no product gain. If Moje mzda is ever wanted for
 *     management, it is a `scope.payrollEmployeeId` feature, not a widening of
 *     this gate.
 *
 * THREE READS, ALL NARROWED BY THE SAME `payrollScope`, NONE BY A URL PARAMETER.
 * There is no employee id in this route — the seat's own id comes off the
 * resolved scope, which came off the membership query's LEFT JOIN. So there is
 * no id to tamper with, and even if there were, `employeeFilter` /
 * `payslipOwnerFilter` AND the seat's own id into every WHERE clause regardless
 * of what a caller asks for (see `payrollLinesForEmployee`'s "three independent
 * fences").
 *
 * IT COMPUTES NOTHING (spec §0.2). No year-to-date total, no average, no
 * gross-minus-net. Every figure is the office's, read as stored; an absent one
 * renders "Neuvedeno" rather than 0 Kč (§0.4).
 *
 * THE COMPANY IS ABSENT FROM THIS PAGE, and that is the §2.6.1 rule ("no company
 * financials") rendered rather than merely enforced: there is no headcount, no
 * `payroll_summary`, no employer-cost total, no period picker listing months the
 * employer ran payroll. The only months named are the ones this person was paid
 * in, carried on their own lines.
 */
export default async function MojeMzdaPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const scope = await resolveOrgScope(orgSlug)

  const visibility = payrollScope(scope)
  if (visibility.kind !== "employee") notFound()

  const [t, employees, lines, payslips] = await Promise.all([
    getBetaTranslations(),
    // Narrowed to exactly this person by `employeeFilter` — the register read is
    // how the page learns its own name, contract type and dates without a
    // bespoke query that could forget the filter.
    payrollEmployeesForScope(scope),
    payrollLinesForEmployee(scope, visibility.employeeId),
    payslipDocumentsForScope(scope),
  ])

  const me = employees[0] ?? null
  const notStated = t("mzdy.amountNotStated")
  const money = (value: string | null | undefined) =>
    (value ? formatBetaMoney(value) : null) ?? notStated

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="font-heading text-lg font-semibold">
          {t("mzdy.mojeMzdaTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("mzdy.mojeMzdaIntro")}
        </p>
      </div>

      {me ? (
        <Card>
          <CardContent className="grid gap-2 py-4 text-sm sm:grid-cols-3">
            <div>
              <span className="block text-xs text-muted-foreground">
                {t("mzdy.zamestnanciColumnName")}
              </span>
              <span className="font-medium">{me.fullName}</span>
            </div>
            <div>
              <span className="block text-xs text-muted-foreground">
                {t("mzdy.mojeMzdaContract")}
              </span>
              <span>{t(CONTRACT_TYPE_LABEL[me.contractType])}</span>
            </div>
            <div>
              <span className="block text-xs text-muted-foreground">
                {me.endedOn
                  ? t("mzdy.mojeMzdaEnded")
                  : t("mzdy.mojeMzdaStarted")}
              </span>
              <span>
                {me.endedOn
                  ? formatBetaDate(me.endedOn)
                  : me.startedOn
                    ? formatBetaDate(me.startedOn)
                    : notStated}
              </span>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-3">
        {lines.length === 0 ? (
          <Card>
            <CardContent className="grid gap-1 py-10 text-center text-sm text-muted-foreground">
              <p className="font-medium text-foreground">
                {t("mzdy.emptyHeading")}
              </p>
              <p>{t("mzdy.mojeMzdaEmpty")}</p>
            </CardContent>
          </Card>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("mzdy.mojeMzdaColumnPeriod")}</TableHead>
                <TableHead className="text-right">
                  {t("mzdy.mojeMzdaColumnGross")}
                </TableHead>
                <TableHead className="text-right">
                  {t("mzdy.mojeMzdaColumnDeductions")}
                </TableHead>
                <TableHead className="text-right">
                  {t("mzdy.mojeMzdaColumnNet")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>{formatReportingPeriodLabel(line.period)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(line.gross)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(line.deductionsTotal)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(line.net)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="text-base font-medium text-foreground">
          {t("mzdy.mojeMzdaPayslipsTitle")}
        </h2>

        {payslips.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("mzdy.mojeMzdaPayslipsEmpty")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("mzdy.vyplatniceColumnFile")}</TableHead>
                <TableHead>{t("mzdy.vyplatniceColumnUploaded")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {payslips.map((payslip) => (
                <TableRow key={payslip.id}>
                  <TableCell className="font-medium">
                    {payslip.filename}
                  </TableCell>
                  <TableCell>{formatBetaDate(payslip.uploadedAt)}</TableCell>
                  <TableCell className="text-right">
                    {/* The same route Výplatnice links to. It resolves the id
                        against `openPayslipFile`, which ANDs this seat's own
                        employee id into the WHERE — so a link edited by hand to
                        a colleague's document id answers the identical 404 an
                        invented one gets. */}
                    <a
                      className="text-sm underline underline-offset-4"
                      href={`/api/orgs/${orgSlug}/payroll/payslips/${payslip.id}/file`}
                    >
                      {t("mzdy.vyplatniceDownload")}
                    </a>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  )
}
