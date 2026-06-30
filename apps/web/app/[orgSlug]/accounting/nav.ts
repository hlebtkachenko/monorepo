import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

/**
 * Accounting module sidebar nav — co-located with the routes. Derived from
 * `docs/specs/SITEMAP.md` (Accounting — regime-aware). `base` = `/${orgSlug}/accounting`.
 *
 * Regime: this is the SUPERSET — both double-entry (Journal/Ledger/Analytical/
 * Trial balance, Chart of accounts) AND cash-regime (Cash journal, Categories)
 * entries are present. Filtering by the active period's regime is a later wave.
 * The nav-drift guard (`pnpm check:nav`) fails if a folder and its nav entry drift.
 */
export function accountingNav(base: string): SidebarNavEntry[] {
  return [
    { label: "Overview", href: base, icon: "Calculator" },
    { label: "Review", href: `${base}/review`, icon: "ListChecksIcon" },
    {
      label: "Books",
      pages: [
        // TODO(regime): gate by active accounting_period.regime_code —
        // journal/ledger/analytical/trial-balance are double-entry, cash-journal is cash.
        { label: "Journal", href: `${base}/journal`, icon: "BookOpen" },
        {
          label: "General ledger",
          href: `${base}/ledger`,
          icon: "BookOpenText",
        },
        {
          label: "Analytical ledger",
          href: `${base}/analytical`,
          icon: "ListIcon",
        },
        {
          label: "Trial balance",
          href: `${base}/trial-balance`,
          icon: "BarChart3",
        },
        {
          label: "Cash journal",
          href: `${base}/cash-journal`,
          icon: "Banknote",
        },
      ],
    },
    {
      label: "Structure",
      pages: [
        // TODO(regime): gate by active accounting_period.regime_code —
        // chart-of-accounts is double-entry, categories replaces it for cash.
        {
          label: "Chart of accounts",
          href: `${base}/chart-of-accounts`,
          icon: "Shapes",
        },
        { label: "Categories", href: `${base}/categories`, icon: "Box" },
        {
          label: "Posting rules",
          href: `${base}/posting-rules`,
          icon: "Workflow",
        },
        {
          label: "Posting checks",
          href: `${base}/posting-checks`,
          icon: "CheckCircle2",
        },
        {
          label: "Opening balances",
          href: `${base}/opening-balances`,
          icon: "Pencil",
        },
      ],
    },
    {
      label: "VAT ledger",
      href: `${base}/vat-ledger`,
      icon: "FileSpreadsheet",
    },
  ]
}
