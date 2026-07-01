import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

/**
 * Reports module sidebar nav. Derived from `docs/specs/SITEMAP.md` (Reports —
 * analytical & statement outputs). `base` = `/${orgSlug}/reports`.
 *
 * Snapshot/report surfaces: live books = Accounting, working open items =
 * Finance, frozen závěrka = Closing. `badge: "TBA"` = not-yet-built placeholder.
 */
export function reportsNav(base: string): SidebarNavEntry[] {
  return [
    {
      label: "Overview",
      href: base,
      icon: "ChartNoAxesCombined",
      badge: "TBA",
    },
    {
      label: "Statements",
      pages: [
        {
          label: "Balance sheet",
          href: `${base}/balance-sheet`,
          icon: "FileSpreadsheet",
          badge: "TBA",
        },
        {
          label: "Income statement",
          href: `${base}/income-statement`,
          icon: "BarChart3",
          badge: "TBA",
          subpages: [
            {
              label: "Statutory",
              href: `${base}/income-statement/statutory`,
              badge: "TBA",
            },
            {
              label: "Monthly P&L",
              href: `${base}/income-statement/monthly`,
              badge: "TBA",
            },
          ],
        },
        {
          label: "Notes",
          href: `${base}/notes`,
          icon: "FileText",
          badge: "TBA",
        },
        {
          label: "Cash flow",
          href: `${base}/cash-flow`,
          icon: "Activity",
          badge: "TBA",
        },
        {
          label: "Equity changes",
          href: `${base}/equity-changes`,
          icon: "RefreshCw",
          badge: "TBA",
        },
        {
          // TODO(regime): cash-regime year-end statements (přehled o majetku a
          // závazcích / o příjmech a výdajích) — shown for cash regimes.
          label: "Assets & liabilities list",
          href: `${base}/assets-liabilities`,
          icon: "ListChecksIcon",
          badge: "TBA",
        },
        {
          label: "Income & expenditure list",
          href: `${base}/income-expenditure`,
          icon: "ListIcon",
          badge: "TBA",
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
          badge: "TBA",
        },
        {
          label: "Trial balance",
          href: `${base}/trial-balance`,
          icon: "ListIcon",
          badge: "TBA",
        },
        {
          label: "Profitability",
          href: `${base}/profitability`,
          icon: "PiggyBank",
          badge: "TBA",
          subpages: [
            {
              label: "Summary",
              href: `${base}/profitability/summary`,
              badge: "TBA",
            },
            {
              label: "Cost & revenue listing",
              href: `${base}/profitability/cost-revenue`,
              badge: "TBA",
            },
          ],
        },
        {
          label: "Management reporting",
          href: `${base}/controlling`,
          icon: "Shapes",
          badge: "TBA",
          subpages: [
            {
              label: "By cost centre",
              href: `${base}/controlling/cost-centers`,
              badge: "TBA",
            },
            { label: "By job", href: `${base}/controlling/jobs`, badge: "TBA" },
            {
              label: "By activity",
              href: `${base}/controlling/activities`,
              badge: "TBA",
            },
            {
              label: "Job profitability",
              href: `${base}/controlling/job-evaluation`,
              badge: "TBA",
            },
          ],
        },
      ],
    },
    {
      label: "Balances",
      pages: [
        {
          label: "Open items by partner",
          href: `${base}/saldo`,
          icon: "BookUser",
          badge: "TBA",
        },
        {
          label: "Account balances",
          href: `${base}/account-balances`,
          icon: "ListIcon",
          badge: "TBA",
        },
        {
          label: "Account movements",
          href: `${base}/account-movements`,
          icon: "ArrowUpDown",
          badge: "TBA",
        },
        {
          label: "Account verification",
          href: `${base}/account-inventory`,
          icon: "ClipboardIcon",
          badge: "TBA",
        },
        {
          label: "Receivables/payables at date",
          href: `${base}/balances-at-date`,
          icon: "CalendarIcon",
          badge: "TBA",
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
          badge: "TBA",
        },
        {
          label: "FX rate list",
          href: `${base}/fx-rate-list`,
          icon: "Globe",
          badge: "TBA",
        },
        {
          label: "Statutory prints",
          href: `${base}/statutory-prints`,
          icon: "FileText",
          badge: "TBA",
          subpages: [
            {
              label: "Journal",
              href: `${base}/statutory-prints/journal`,
              badge: "TBA",
            },
            {
              label: "General ledger",
              href: `${base}/statutory-prints/ledger`,
              badge: "TBA",
            },
          ],
        },
        {
          label: "XML statement export",
          href: `${base}/xml-export`,
          icon: "Download",
          badge: "TBA",
        },
        {
          label: "Audit confirmation letters",
          href: `${base}/confirmation-letters`,
          icon: "Mail",
          badge: "TBA",
        },
      ],
    },
  ]
}
