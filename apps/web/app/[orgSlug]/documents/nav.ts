import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

/**
 * Records (Documents) module sidebar nav. Derived from `docs/specs/SITEMAP.md`.
 * `base` = `/${orgSlug}/documents`. Depth-3: document families are Pages, their
 * Received/Issued (or subtype) splits are Subpages.
 *
 * `badge: "TBA"` = not-yet-built placeholder; remove when the real body ships.
 */
export function documentsNav(base: string): SidebarNavEntry[] {
  return [
    { label: "Overview", href: base, icon: "FolderBookmark", badge: "TBA" },
    { label: "Inbox", href: `${base}/inbox`, icon: "Inbox", badge: "TBA" },
    {
      label: "Invoices & vouchers",
      pages: [
        {
          label: "Invoices",
          href: `${base}/invoices`,
          icon: "FileText",
          badge: "TBA",
          subpages: [
            {
              label: "Received",
              href: `${base}/invoices/received`,
              badge: "TBA",
            },
            { label: "Issued", href: `${base}/invoices/issued`, badge: "TBA" },
          ],
        },
        {
          label: "Advances",
          href: `${base}/advances`,
          icon: "FileSpreadsheet",
          badge: "TBA",
          subpages: [
            {
              label: "Received",
              href: `${base}/advances/received`,
              badge: "TBA",
            },
            { label: "Issued", href: `${base}/advances/issued`, badge: "TBA" },
          ],
        },
        {
          label: "Credit & debit notes",
          href: `${base}/credit-notes`,
          icon: "RotateCcw",
          badge: "TBA",
          subpages: [
            {
              label: "Received",
              href: `${base}/credit-notes/received`,
              badge: "TBA",
            },
            {
              label: "Issued",
              href: `${base}/credit-notes/issued`,
              badge: "TBA",
            },
          ],
        },
        {
          label: "Obligation documents",
          href: `${base}/obligation-vouchers`,
          icon: "ClipboardIcon",
          badge: "TBA",
          subpages: [
            {
              label: "Payable",
              href: `${base}/obligation-vouchers/payable`,
              badge: "TBA",
            },
            {
              label: "Receivable",
              href: `${base}/obligation-vouchers/receivable`,
              badge: "TBA",
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
          badge: "TBA",
        },
        {
          label: "Internal documents",
          href: `${base}/internal-documents`,
          icon: "FileCogIcon",
          badge: "TBA",
          subpages: [
            {
              label: "Internal",
              href: `${base}/internal-documents/internal`,
              badge: "TBA",
            },
            {
              label: "Customs declaration",
              href: `${base}/internal-documents/customs`,
              badge: "TBA",
            },
          ],
        },
      ],
    },
    {
      label: "Recurring templates",
      href: `${base}/recurring-templates`,
      icon: "RefreshCw",
      badge: "TBA",
    },
  ]
}
