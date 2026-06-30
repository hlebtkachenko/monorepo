import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

/**
 * Closing module sidebar nav. Derived from `docs/specs/SITEMAP.md` (Closing —
 * the unified period-close cockpit, THE UVP). `base` = `/${orgSlug}/closing`.
 *
 * Two layers: the DYNAMIC cockpit (Overview board ⇄ Calendar) drives the
 * per-period close flows; the ALWAYS-ON Obligations pages give each obligation
 * KIND a stable, navigable home (the per-period instances render inside them).
 * Subpages = the concrete filings/steps under each kind.
 */
export function closingNav(base: string): SidebarNavEntry[] {
  return [
    { label: "Overview", href: base, icon: "CalendarClock" },
    { label: "Calendar", href: `${base}/calendar`, icon: "CalendarIcon" },
    {
      label: "Obligations",
      pages: [
        {
          // TODO(regime): gate on vat_status (plátce / IO only).
          label: "VAT",
          href: `${base}/vat`,
          icon: "ReceiptEuro",
          subpages: [
            { label: "DAP", href: `${base}/vat/dap` },
            { label: "KH", href: `${base}/vat/kh` },
            { label: "SH", href: `${base}/vat/sh` },
            { label: "OSS", href: `${base}/vat/oss` },
            { label: "IOSS", href: `${base}/vat/ioss` },
          ],
        },
        {
          // TODO(regime): gate on has_employees.
          label: "Payroll",
          href: `${base}/payroll`,
          icon: "Users",
          subpages: [
            { label: "JMHZ", href: `${base}/payroll/jmhz` },
            { label: "Social (SP)", href: `${base}/payroll/social` },
            { label: "Health (ZP)", href: `${base}/payroll/health` },
            { label: "Withholding", href: `${base}/payroll/withholding` },
          ],
        },
        {
          label: "Income tax",
          href: `${base}/income-tax`,
          icon: "Calculator",
          subpages: [
            { label: "DPPO", href: `${base}/income-tax/dppo` },
            { label: "DPFO", href: `${base}/income-tax/dpfo` },
            { label: "Advances", href: `${base}/income-tax/advances` },
          ],
        },
        {
          label: "Year-end",
          href: `${base}/year-end`,
          icon: "Archive",
          subpages: [
            { label: "Accruals", href: `${base}/year-end/accruals` },
            { label: "Provisions", href: `${base}/year-end/provisions` },
            {
              label: "Value adjustments",
              href: `${base}/year-end/value-adjustments`,
            },
            { label: "Deferred tax", href: `${base}/year-end/deferred-tax` },
            { label: "Statements", href: `${base}/year-end/statements` },
            { label: "Publication", href: `${base}/year-end/publication` },
            { label: "Year close", href: `${base}/year-end/close` },
          ],
        },
      ],
    },
    { label: "Archive", href: `${base}/archive`, icon: "FileArchive" },
  ]
}
