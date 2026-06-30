import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

/**
 * Accounting module sidebar nav — co-located with the routes. Derived from
 * `docs/specs/SITEMAP.md` (Accounting — regime-aware). `base` = `/${orgSlug}/accounting`.
 *
 * Depth-3: Group › Page › Subpage. Subpages are real routes. Regime = SUPERSET
 * (both double-entry + cash entries present); filtering by the active period's
 * regime is a later wave. The nav-drift guard (`pnpm check:nav`) fails on drift.
 */
export function accountingNav(base: string): SidebarNavEntry[] {
  return [
    { label: "Overview", href: base, icon: "Calculator" },
    { label: "Review", href: `${base}/review`, icon: "ListChecksIcon" },
    {
      label: "Books",
      pages: [
        // TODO(regime): gate by active accounting_period.regime_code —
        // journal/ledger/off-balance/analytical/trial-balance are double-entry, cash-journal is cash.
        { label: "Journal", href: `${base}/journal`, icon: "BookOpen" },
        {
          label: "General ledger",
          href: `${base}/ledger`,
          icon: "BookOpenText",
        },
        {
          label: "Off-balance ledger",
          href: `${base}/off-balance`,
          icon: "BookmarkIcon",
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
      label: "VAT",
      pages: [
        {
          // TODO(regime): gate on vat_status (plátce / IO only).
          label: "VAT ledger",
          href: `${base}/vat-ledger`,
          icon: "FileSpreadsheet",
          subpages: [
            { label: "Input", href: `${base}/vat-ledger/input` },
            { label: "Output", href: `${base}/vat-ledger/output` },
            {
              label: "Reverse-charge / PDP",
              href: `${base}/vat-ledger/reverse-charge`,
            },
            { label: "Členění", href: `${base}/vat-ledger/breakdown` },
          ],
        },
      ],
    },
  ]
}
