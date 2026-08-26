import type { ReactNode } from "react"

import { assertNotEmployeeSeat } from "@/lib/data/scope"

import { resolveOrgScope } from "../_lib/org-scope"

/**
 * The Majetek tree (spec §2.7).
 *
 * A LAYOUT THAT RENDERS NO CHROME, for the reason `finance/layout.tsx` gives in
 * full: it exists to give `assertNotEmployeeSeat` a module root, so the register
 * and every asset detail page beneath it refuse the employee seat without each
 * one having to remember to (spec §2.6.1, "Everything else 404").
 *
 * `payroll-seat-fence.boundary.test.ts` fails if this call is ever removed.
 */
export default async function MajetekLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  assertNotEmployeeSeat(await resolveOrgScope(orgSlug))

  return children
}
