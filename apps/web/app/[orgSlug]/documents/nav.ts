import type { SidebarNavEntry } from "@workspace/ui/blocks/sidebar-panel"

/**
 * Records (Documents) module sidebar nav. Derived from `docs/specs/SITEMAP.md`.
 * `base` = `/${orgSlug}/documents`. Depth-3: document families are Pages, their
 * Received/Issued (or subtype) splits are Subpages.
 *
 * `tba: true` = not-yet-built placeholder; remove when the real body ships.
 */
export function documentsNav(base: string): SidebarNavEntry[] {
  return [
    { label: "Overview", href: base, icon: "FolderBookmark" },
    { label: "Inbox", href: `${base}/inbox`, icon: "Inbox" },
    {
      label: "Invoices & vouchers",
      pages: [
        {
          label: "Invoices",
          href: `${base}/invoices`,
          icon: "FileText",
          tba: true,
          subpages: [
            {
              label: "Received",
              href: `${base}/invoices/received`,
            },
            { label: "Issued", href: `${base}/invoices/issued` },
          ],
        },
        {
          label: "Advances",
          href: `${base}/advances`,
          icon: "FileSpreadsheet",
          tba: true,
          subpages: [
            {
              label: "Received",
              href: `${base}/advances/received`,
              tba: true,
            },
            { label: "Issued", href: `${base}/advances/issued`, tba: true },
          ],
        },
        {
          label: "Credit & debit notes",
          href: `${base}/credit-notes`,
          icon: "RotateCcw",
          tba: true,
          subpages: [
            {
              label: "Received",
              href: `${base}/credit-notes/received`,
              tba: true,
            },
            {
              label: "Issued",
              href: `${base}/credit-notes/issued`,
              tba: true,
            },
          ],
        },
        {
          label: "Obligation documents",
          href: `${base}/obligation-vouchers`,
          icon: "ClipboardIcon",
          tba: true,
          subpages: [
            {
              label: "Payable",
              href: `${base}/obligation-vouchers/payable`,
            },
            {
              label: "Receivable",
              href: `${base}/obligation-vouchers/receivable`,
            },
          ],
        },
      ],
    },
    {
      label: "Other documents",
      pages: [
        {
          label: "Loan documents",
          href: `${base}/loan-documents`,
          icon: "PiggyBank",
          tba: true,
        },
        {
          label: "Internal documents",
          href: `${base}/internal-documents`,
          icon: "FileCogIcon",
          subpages: [
            {
              label: "Customs declaration",
              href: `${base}/internal-documents/customs`,
              tba: true,
            },
          ],
        },
      ],
    },
    {
      label: "Recurring templates",
      href: `${base}/recurring-templates`,
      icon: "RefreshCw",
      tba: true,
    },
  ]
}
