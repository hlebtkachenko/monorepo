import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

/**
 * HR module sidebar nav. Derived from `docs/specs/SITEMAP.md` (HR — people &
 * payroll; mock — no v2 payroll entity yet). `base` = `/${orgSlug}/hr`.
 *
 * Depth-3: Agreements (DPP/DPC) and the six Payroll-report filings are Subpages.
 * Employee-card tabs (Srážky, prohlášení, …) stay per-record detail tabs.
 * People/Payroll gated on `has_employees` (gate not wired yet — superset now).
 */
export function hrNav(base: string): SidebarNavEntry[] {
  return [
    { label: "Overview", href: base, icon: "Users" },
    { label: "Review", href: `${base}/review`, icon: "ListChecksIcon" },
    {
      // TODO(regime): gate by has_employees.
      label: "People",
      pages: [
        { label: "Employees", href: `${base}/employees`, icon: "User" },
        {
          label: "Agreements",
          href: `${base}/agreements`,
          icon: "FileText",
          subpages: [
            { label: "DPP", href: `${base}/agreements/dpp` },
            { label: "DPC", href: `${base}/agreements/dpc` },
          ],
        },
      ],
    },
    {
      // TODO(regime): gate by has_employees.
      label: "Payroll",
      pages: [
        {
          label: "Payroll runs",
          href: `${base}/payroll-runs`,
          icon: "Banknote",
        },
        {
          label: "Payroll posting",
          href: `${base}/payroll-posting`,
          icon: "Workflow",
        },
        {
          label: "Attendance",
          href: `${base}/attendance`,
          icon: "CalendarIcon",
        },
        {
          label: "eNeschopenky / eDávky",
          href: `${base}/e-davky`,
          icon: "Activity",
        },
        {
          label: "Payroll reports",
          href: `${base}/payroll-reports`,
          icon: "FileSpreadsheet",
          subpages: [
            {
              label: "Vyúčtování ZČ",
              href: `${base}/payroll-reports/income-tax`,
            },
            {
              label: "Vyúčtování srážková",
              href: `${base}/payroll-reports/withholding`,
            },
            { label: "Zdravotní", href: `${base}/payroll-reports/health` },
            { label: "Sociální", href: `${base}/payroll-reports/social` },
            { label: "Daňové", href: `${base}/payroll-reports/tax` },
            {
              label: "Náhrady nemoc",
              href: `${base}/payroll-reports/sick-pay`,
            },
          ],
        },
        {
          label: "Payroll sheets",
          href: `${base}/payroll-sheets`,
          icon: "ClipboardIcon",
        },
        { label: "ELDP", href: `${base}/eldp`, icon: "IdCard" },
      ],
    },
    {
      label: "Vehicles",
      pages: [
        { label: "Vehicles", href: `${base}/vehicles`, icon: "Box" },
        { label: "Trip log", href: `${base}/trip-log`, icon: "ListIcon" },
        { label: "Drivers", href: `${base}/drivers`, icon: "CircleUser" },
      ],
    },
  ]
}
