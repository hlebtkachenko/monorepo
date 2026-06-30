import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

/**
 * Reports module sidebar nav. Derived from `docs/specs/SITEMAP.md` (Reports —
 * analytical & statement outputs, agent-generated). `base` = `/${orgSlug}/reports`.
 *
 * Depth-3: report variants (statutory vs monthly P&L, profitability cuts,
 * controlling dimensions, the statutory-print books) are Subpages — real routes.
 * These are the snapshot/report surfaces; live books = Accounting, working saldo
 * = Finance, frozen závěrka = Closing.
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
          subpages: [
            { label: "Statutory", href: `${base}/income-statement/statutory` },
            { label: "Monthly P&L", href: `${base}/income-statement/monthly` },
          ],
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
          subpages: [
            { label: "Summary", href: `${base}/profitability/summary` },
            {
              label: "Cost & revenue listing",
              href: `${base}/profitability/cost-revenue`,
            },
          ],
        },
        {
          label: "Controlling",
          href: `${base}/controlling`,
          icon: "Shapes",
          subpages: [
            {
              label: "By cost center",
              href: `${base}/controlling/cost-centers`,
            },
            { label: "By job", href: `${base}/controlling/jobs` },
            { label: "By activity", href: `${base}/controlling/activities` },
            {
              label: "Job evaluation",
              href: `${base}/controlling/job-evaluation`,
            },
          ],
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
          subpages: [
            { label: "Journal", href: `${base}/statutory-prints/journal` },
            {
              label: "General ledger",
              href: `${base}/statutory-prints/ledger`,
            },
          ],
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
