import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

/**
 * Closing module sidebar nav. Derived from `docs/specs/SITEMAP.md` (Closing —
 * the unified period-close cockpit, THE UVP). `base` = `/${orgSlug}/closing`.
 *
 * Layers: dynamic cockpit (Overview board ⇄ Calendar) · Monthly close (routine
 * per-month cycle) · Obligations (each obligation KIND has a stable home) ·
 * Archive. `badge: "TBA"` = not-yet-built placeholder.
 */
export function closingNav(base: string): SidebarNavEntry[] {
  return [
    { label: "Overview", href: base, icon: "CalendarClock", badge: "TBA" },
    {
      label: "Calendar",
      href: `${base}/calendar`,
      icon: "CalendarIcon",
      badge: "TBA",
    },
    {
      label: "Monthly close",
      pages: [
        // Under Unclosed / Closed the individual months are DYNAMIC subpages
        // (a `[period]` route rendered per accounting_period at runtime), not
        // static nav leaves — so they are not listed here.
        {
          label: "Unclosed",
          href: `${base}/unclosed`,
          icon: "LockOpen",
          badge: "TBA",
        },
        { label: "Closed", href: `${base}/closed`, icon: "Lock", badge: "TBA" },
      ],
    },
    {
      label: "Obligations",
      pages: [
        {
          // TODO(regime): gate on vat_status (plátce / IO only).
          label: "VAT",
          href: `${base}/vat`,
          icon: "ReceiptEuro",
          badge: "TBA",
          subpages: [
            { label: "VAT return", href: `${base}/vat/dap`, badge: "TBA" },
            {
              label: "Control statement",
              href: `${base}/vat/kh`,
              badge: "TBA",
            },
            { label: "EC Sales List", href: `${base}/vat/sh`, badge: "TBA" },
            { label: "OSS", href: `${base}/vat/oss`, badge: "TBA" },
            { label: "IOSS", href: `${base}/vat/ioss`, badge: "TBA" },
          ],
        },
        {
          // TODO(regime): gate on has_employees.
          label: "Payroll",
          href: `${base}/payroll`,
          icon: "Users",
          badge: "TBA",
          subpages: [
            {
              label: "Monthly employer report",
              href: `${base}/payroll/jmhz`,
              badge: "TBA",
            },
            {
              label: "Social insurance",
              href: `${base}/payroll/social`,
              badge: "TBA",
            },
            {
              label: "Health insurance",
              href: `${base}/payroll/health`,
              badge: "TBA",
            },
            {
              label: "Withholding tax",
              href: `${base}/payroll/withholding`,
              badge: "TBA",
            },
          ],
        },
        {
          label: "Income tax",
          href: `${base}/income-tax`,
          icon: "Calculator",
          badge: "TBA",
          subpages: [
            {
              label: "Corporation tax",
              href: `${base}/income-tax/dppo`,
              badge: "TBA",
            },
            {
              label: "Personal income tax",
              href: `${base}/income-tax/dpfo`,
              badge: "TBA",
            },
            {
              label: "Advances",
              href: `${base}/income-tax/advances`,
              badge: "TBA",
            },
          ],
        },
        {
          label: "Year-end",
          href: `${base}/year-end`,
          icon: "Archive",
          badge: "TBA",
          subpages: [
            {
              label: "Accruals",
              href: `${base}/year-end/accruals`,
              badge: "TBA",
            },
            {
              label: "Provisions",
              href: `${base}/year-end/provisions`,
              badge: "TBA",
            },
            {
              label: "Value adjustments",
              href: `${base}/year-end/value-adjustments`,
              badge: "TBA",
            },
            {
              label: "Deferred tax",
              href: `${base}/year-end/deferred-tax`,
              badge: "TBA",
            },
            {
              label: "Statements",
              href: `${base}/year-end/statements`,
              badge: "TBA",
            },
            {
              label: "Publication",
              href: `${base}/year-end/publication`,
              badge: "TBA",
            },
            {
              label: "Year close",
              href: `${base}/year-end/close`,
              badge: "TBA",
            },
          ],
        },
      ],
    },
    {
      label: "Archive",
      href: `${base}/archive`,
      icon: "FileArchive",
      badge: "TBA",
    },
  ]
}
