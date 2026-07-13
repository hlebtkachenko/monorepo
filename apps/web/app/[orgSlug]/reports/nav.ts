import type { SidebarNavEntry } from "@workspace/ui/blocks/sidebar-panel"

/**
 * Reports module sidebar nav. Derived from `docs/specs/SITEMAP.md` (Reports —
 * analytical & statement outputs). `base` = `/${orgSlug}/reports`.
 *
 * Snapshot/report surfaces: live books = Accounting, working open items =
 * Finance, frozen závěrka = Closing. `tba: true` = not-yet-built placeholder.
 */
export function reportsNav(base: string): SidebarNavEntry[] {
  return [
    {
      label: "Overview",
      href: base,
      icon: "ChartNoAxesCombined",
      tba: true,
    },
    {
      label: "Statements",
      pages: [
        {
          label: "Balance sheet",
          href: `${base}/balance-sheet`,
          icon: "FileSpreadsheet",
          tba: true,
        },
        {
          label: "Income statement",
          href: `${base}/income-statement`,
          icon: "BarChart3",
          tba: true,
          subpages: [
            {
              label: "Statutory",
              href: `${base}/income-statement/statutory`,
              tba: true,
            },
            {
              label: "Monthly P&L",
              href: `${base}/income-statement/monthly`,
              tba: true,
            },
          ],
        },
        {
          label: "Notes",
          href: `${base}/notes`,
          icon: "FileText",
          tba: true,
        },
        {
          label: "Cash flow",
          href: `${base}/cash-flow`,
          icon: "Activity",
          tba: true,
        },
        {
          label: "Equity changes",
          href: `${base}/equity-changes`,
          icon: "RefreshCw",
          tba: true,
        },
        {
          // TODO(regime): cash-regime year-end statements (přehled o majetku a
          // závazcích / o příjmech a výdajích) — shown for cash regimes.
          label: "Assets & liabilities list",
          href: `${base}/assets-liabilities`,
          icon: "ListChecksIcon",
          tba: true,
        },
        {
          label: "Income & expenditure list",
          href: `${base}/income-expenditure`,
          icon: "ListIcon",
          tba: true,
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
          tba: true,
        },
        {
          label: "Trial balance",
          href: `${base}/trial-balance`,
          icon: "ListIcon",
          tba: true,
        },
        {
          label: "Profitability",
          href: `${base}/profitability`,
          icon: "PiggyBank",
          tba: true,
          subpages: [
            {
              label: "Summary",
              href: `${base}/profitability/summary`,
              tba: true,
            },
            {
              label: "Cost & revenue listing",
              href: `${base}/profitability/cost-revenue`,
              tba: true,
            },
          ],
        },
        {
          label: "Management reporting",
          href: `${base}/controlling`,
          icon: "Shapes",
          tba: true,
          subpages: [
            {
              label: "By cost centre",
              href: `${base}/controlling/cost-centers`,
              tba: true,
            },
            { label: "By job", href: `${base}/controlling/jobs`, tba: true },
            {
              label: "By activity",
              href: `${base}/controlling/activities`,
              tba: true,
            },
            {
              label: "Job profitability",
              href: `${base}/controlling/job-evaluation`,
              tba: true,
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
          tba: true,
        },
        {
          label: "Account balances",
          href: `${base}/account-balances`,
          icon: "ListIcon",
          tba: true,
        },
        {
          label: "Account movements",
          href: `${base}/account-movements`,
          icon: "ArrowUpDown",
          tba: true,
        },
        {
          label: "Account verification",
          href: `${base}/account-inventory`,
          icon: "ClipboardIcon",
          tba: true,
        },
        {
          label: "Receivables/payables at date",
          href: `${base}/balances-at-date`,
          icon: "CalendarIcon",
          tba: true,
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
          tba: true,
        },
        {
          label: "FX rate list",
          href: `${base}/fx-rate-list`,
          icon: "Globe",
          tba: true,
        },
        {
          label: "Statutory prints",
          href: `${base}/statutory-prints`,
          icon: "FileText",
          tba: true,
          subpages: [
            {
              label: "Journal",
              href: `${base}/statutory-prints/journal`,
              tba: true,
            },
            {
              label: "General ledger",
              href: `${base}/statutory-prints/ledger`,
              tba: true,
            },
          ],
        },
        {
          label: "XML statement export",
          href: `${base}/xml-export`,
          icon: "Download",
          tba: true,
        },
        {
          label: "Audit confirmation letters",
          href: `${base}/confirmation-letters`,
          icon: "Mail",
          tba: true,
        },
      ],
    },
  ]
}
