import { notFound } from "next/navigation"

import { DashboardDemo } from "../../_components/dashboard-demo/dashboard-demo"

export const metadata = { title: "Dashboard demo" }

/**
 * SAVED DEMO (#425) — the Dashboard archetype prototype on the persistent org
 * shell: scoped view tabs (Overview / Revenue / Expenses) in the content header,
 * a working toolbar (a FilterBar over the ledger + a granularity toggle · export
 * / refresh), then KPI tiles with sparklines + interactive charts, all aggregated
 * from a filterable transaction ledger. Reachable at `/<org>/demo-dashboard`,
 * hidden from nav (allow-listed in scripts/check-nav.ts). DEV-ONLY: any
 * production build returns 404, so the mock data never ships.
 */
export default function DemoDashboardPage() {
  if (process.env.NODE_ENV === "production") notFound()
  return <DashboardDemo />
}
