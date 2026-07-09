import { notFound } from "next/navigation"

import { getPayrollObligations } from "./_lib/payroll-data"
import { PayrollView } from "./_components/payroll-view"

export const metadata = { title: "Payroll" }

/**
 * Payroll — the period's real computed payroll obligations (social
 * insurance, health insurance, withholding tax), sourced from
 * `getPayrollObligations` (VAT-independent — see that loader's docstring).
 */
export default async function PayrollPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const data = await getPayrollObligations(orgSlug)
  if (data.status === "no-access") notFound()

  return <PayrollView slug={orgSlug} data={data} />
}
