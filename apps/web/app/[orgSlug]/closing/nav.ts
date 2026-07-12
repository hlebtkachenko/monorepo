import type { SidebarNavEntry } from "@workspace/ui/blocks/sidebar-panel"

/**
 * Closing module sidebar nav. Derived from `docs/specs/SITEMAP.md` (Closing —
 * the unified period-close cockpit, THE UVP). `base` = `/${orgSlug}/closing`.
 *
 * Layers: dynamic cockpit (Overview board ⇄ Calendar) · Monthly close (routine
 * per-month cycle) · Obligations (each obligation KIND has a stable home) ·
 * Archive. `tba: true` = not-yet-built placeholder.
 */
export function closingNav(base: string): SidebarNavEntry[] {
  return [
    { label: "Overview", href: base, icon: "CalendarClock" },
    {
      label: "Calendar",
      href: `${base}/calendar`,
      icon: "CalendarIcon",
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
          tba: true,
        },
        { label: "Closed", href: `${base}/closed`, icon: "Lock", tba: true },
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
          subpages: [
            { label: "VAT return", href: `${base}/vat/dap` },
            { label: "Control statement", href: `${base}/vat/kh` },
            { label: "EC Sales List", href: `${base}/vat/sh` },
            { label: "OSS", href: `${base}/vat/oss`, tba: true },
            { label: "IOSS", href: `${base}/vat/ioss`, tba: true },
          ],
        },
        {
          // TODO(regime): gate on has_employees.
          label: "Payroll",
          href: `${base}/payroll`,
          icon: "Users",
          subpages: [
            {
              label: "Monthly employer report",
              href: `${base}/payroll/jmhz`,
              tba: true,
            },
            {
              label: "Social insurance",
              href: `${base}/payroll/social`,
              tba: true,
            },
            {
              label: "Health insurance",
              href: `${base}/payroll/health`,
              tba: true,
            },
            {
              label: "Withholding tax",
              href: `${base}/payroll/withholding`,
              tba: true,
            },
          ],
        },
        {
          label: "Income tax",
          href: `${base}/income-tax`,
          icon: "Calculator",
          subpages: [
            {
              label: "Corporation tax",
              href: `${base}/income-tax/dppo`,
            },
            {
              label: "Section 7 tax-record worksheet",
              href: `${base}/income-tax/dpfo`,
            },
            {
              label: "Advances",
              href: `${base}/income-tax/advances`,
              tba: true,
            },
          ],
        },
        {
          // Statistical declaration (ČSÚ, via the Celní správa INTRASTAT-CZ
          // portal) — NOT a tax. Activity-gated: intra-EU goods trade ≥ 15M CZK
          // per flow/yr (§58 Act 242/2016 + NV 333/2021, EU Reg 2019/2152).
          label: "Intrastat",
          href: `${base}/intrastat`,
          icon: "Globe",
          tba: true,
          subpages: [
            {
              label: "Dispatches",
              href: `${base}/intrastat/dispatches`,
              tba: true,
            },
            {
              label: "Arrivals",
              href: `${base}/intrastat/arrivals`,
              tba: true,
            },
          ],
        },
        {
          label: "Year-end",
          href: `${base}/year-end`,
          icon: "Archive",
          subpages: [
            {
              label: "Accruals",
              href: `${base}/year-end/accruals`,
              tba: true,
            },
            {
              label: "Provisions",
              href: `${base}/year-end/provisions`,
              tba: true,
            },
            {
              label: "Value adjustments",
              href: `${base}/year-end/value-adjustments`,
              tba: true,
            },
            {
              label: "Deferred tax",
              href: `${base}/year-end/deferred-tax`,
              tba: true,
            },
            {
              label: "Draft closing worksheet",
              href: `${base}/year-end/statements`,
            },
            {
              label: "Publication",
              href: `${base}/year-end/publication`,
              tba: true,
            },
            {
              label: "Year close",
              href: `${base}/year-end/close`,
              tba: true,
            },
          ],
        },
      ],
    },
    {
      label: "Archive",
      href: `${base}/archive`,
      icon: "FileArchive",
      tba: true,
    },
  ]
}
