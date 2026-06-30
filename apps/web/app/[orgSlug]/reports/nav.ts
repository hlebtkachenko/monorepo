import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

/**
 * Reports module sidebar nav. Derived from `docs/specs/SITEMAP.md` (Reports —
 * analytical & statement outputs, agent-generated). `base` = `/${orgSlug}/reports`.
 *
 * These are the report/snapshot surfaces: the live books live in Accounting, the
 * working saldo in Finance, the frozen závěrka snapshots in Closing. The monthly
 * P&L / soupis N&V / job-evaluation lenses are body tabs, not nav leaves.
 */
export function reportsNav(base: string): SidebarNavEntry[] {
  return [
    { label: "Overview", href: base, icon: "ChartNoAxesCombined" },
    {
      label: "Statements",
      pages: [
        {
          label: "Balance sheet",
          href: `${base}/balance-sheet`,
          icon: "FileSpreadsheet",
        },
        {
          label: "Income statement",
          href: `${base}/income-statement`,
          icon: "BarChart3",
        },
        { label: "Notes", href: `${base}/notes`, icon: "FileText" },
        { label: "Cash flow", href: `${base}/cash-flow`, icon: "Activity" },
        {
          label: "Equity changes",
          href: `${base}/equity-changes`,
          icon: "RefreshCw",
        },
      ],
    },
    {
      label: "Analysis",
      pages: [
        {
          label: "Account analysis",
          href: `${base}/account-analysis`,
          icon: "Search",
        },
        {
          label: "Trial balance",
          href: `${base}/trial-balance`,
          icon: "ListIcon",
        },
        {
          label: "Profitability",
          href: `${base}/profitability`,
          icon: "PiggyBank",
        },
        {
          label: "Controlling",
          href: `${base}/controlling`,
          icon: "Shapes",
        },
      ],
    },
    {
      label: "Balances",
      pages: [
        { label: "Saldo per partner", href: `${base}/saldo`, icon: "BookUser" },
        {
          label: "Account balances",
          href: `${base}/account-balances`,
          icon: "ListIcon",
        },
        {
          label: "Account movements",
          href: `${base}/account-movements`,
          icon: "ArrowUpDown",
        },
        {
          label: "Account inventory",
          href: `${base}/account-inventory`,
          icon: "ClipboardIcon",
        },
        {
          label: "Receivables/payables at date",
          href: `${base}/balances-at-date`,
          icon: "CalendarIcon",
        },
      ],
    },
    {
      label: "Print exports",
      pages: [
        {
          label: "Document journal",
          href: `${base}/document-journal`,
          icon: "BookOpen",
        },
        { label: "FX rate list", href: `${base}/fx-rate-list`, icon: "Globe" },
        {
          label: "Statutory prints",
          href: `${base}/statutory-prints`,
          icon: "FileText",
        },
        {
          label: "XML statement export",
          href: `${base}/xml-export`,
          icon: "Download",
        },
        {
          label: "Audit confirmation letters",
          href: `${base}/confirmation-letters`,
          icon: "Mail",
        },
      ],
    },
  ]
}
