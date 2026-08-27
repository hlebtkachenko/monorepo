import { notFound } from "next/navigation"

import { Card, CardContent } from "@workspace/ui/components/card"

import { getBetaTranslations } from "@/i18n/translations-server"
import {
  payrollEmployeesForScope,
  payrollScope,
  publishedPayrollPeriods,
} from "@/lib/data/payroll"
import { payslipDocumentsForScope } from "@/lib/data/payslips"

import { PageHeader } from "../../../../_components/page-header"

import { resolveOrgScope } from "../../_lib/org-scope"
import { PeriodPicker } from "../_components/period-picker"
import { PERIOD_PARAM, selectPeriod } from "../_lib/period-selection"

import { PayslipBulkUploadForm } from "./_components/payslip-bulk-upload-form"
import { PayslipsTable } from "./_components/payslips-table"

/**
 * Výplatnice (spec §2.6): "payslip PDFs per employee per month; office bulk
 * ZIP upload with filename→employee matching preview."
 *
 * A PERIOD IS REQUIRED, UNLIKE PŘEHLED MEZD. A payslip has no meaning outside
 * a published payroll period (`uploadPayslipDocument` refuses one that names
 * anything else), so — unlike Přehled mezd, whose empty state is its own
 * card — this page's whole body is gated on `period` existing at all: no
 * period picker even to offer, the same "offer only what has a published
 * batch" contract every other Mzdy page already applies.
 *
 * THE UPLOAD FORM IS OWNER-ONLY, MANAGEMENT SEATS READ EVERYTHING.
 * `payroll.ts`'s header states the rule this page reflects: payroll WRITES
 * take an `OwnerScope`, so admin and member (both management, per
 * `payrollScope`) see every existing payslip and the same table an owner
 * does, but not the bulk-upload card — the same relationship
 * `mzdy/layout.tsx` has with a guest, one role narrower.
 */
export default async function VyplatnicePage({
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

  const [t, employees, periods] = await Promise.all([
    getBetaTranslations(),
    payrollEmployeesForScope(scope),
    publishedPayrollPeriods(scope),
  ])
  const period = selectPeriod(periods, requested)
  const payslips = period
    ? await payslipDocumentsForScope(scope, { periodId: period.id })
    : []

  const basePath = `/${orgSlug}/mzdy/vyplatnice`

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("mzdy.vyplatniceTitle")}
        intro={t("mzdy.vyplatniceIntro")}
      />

      {periods.length > 0 ? (
        <PeriodPicker basePath={basePath} periods={periods} current={period} />
      ) : null}

      {!period ? (
        <Card>
          <CardContent className="grid gap-1 py-10 text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              {t("mzdy.emptyHeading")}
            </p>
            <p>{t("mzdy.vyplatniceNoPeriod")}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <PayslipsTable orgSlug={orgSlug} payslips={payslips} />

          {scope.role === "owner" ? (
            <PayslipBulkUploadForm
              orgSlug={orgSlug}
              periodId={period.id}
              employees={employees.map((employee) => ({
                id: employee.id,
                fullName: employee.fullName,
              }))}
            />
          ) : null}
        </>
      )}
    </div>
  )
}
