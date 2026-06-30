import { notFound } from "next/navigation"

import { DashboardDemo } from "../../_components/dashboard-demo/dashboard-demo"

export const metadata = { title: "Dashboard demo" }

/**
 * SAVED DEMO (#425) — the Dashboard archetype prototype on the persistent org
 * shell. The content header carries scoped view tabs (Overview / Revenue /
 * Expenses) plus the shared manage-tabs / favorite / config cluster. The toolbar
 * reads like the Table toolbar: LEFT = a working FilterBar over the ledger + a
 * predefined-timeframe Select (re-buckets month vs. quarter); RIGHT = a "Widgets"
 * show/hide menu, an "+ Add widget" split button, and a Chart/Table format
 * switch. The body is KPI tiles with sparklines + interactive charts (Chart mode)
 * or a metrics-as-rows matrix table (Table mode), all aggregated from a
 * filterable transaction ledger. Reachable at `/<org>/demo-dashboard`, hidden
 * from nav (allow-listed in scripts/check-nav.ts). DEV-ONLY: any production build
 * returns 404, so the mock data never ships.
 */
export default function DemoDashboardPage() {
  if (process.env.NODE_ENV === "production") notFound()
  return <DashboardDemo />
}
