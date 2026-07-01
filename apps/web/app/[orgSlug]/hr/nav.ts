import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

/**
 * HR module sidebar nav. Derived from `docs/specs/SITEMAP.md` (HR — people &
 * payroll; mock — no v2 payroll entity yet). `base` = `/${orgSlug}/hr`.
 *
 * People/Payroll gated on `has_employees` (gate not wired yet — superset now).
 * Vehicles/fleet moved to Assets. `badge: "TBA"` = not-yet-built placeholder.
 */
export function hrNav(base: string): SidebarNavEntry[] {
  return [
    { label: "Overview", href: base, icon: "Users", badge: "TBA" },
    // AI-prepared payroll runs awaiting a human's review + approval.
    {
      label: "Payroll approvals",
      href: `${base}/approvals`,
      icon: "ListChecksIcon",
      badge: "TBA",
    },
    {
      // TODO(regime): gate by has_employees.
      label: "People",
      pages: [
        {
          label: "Employees",
          href: `${base}/employees`,
          icon: "User",
          badge: "TBA",
        },
        {
          label: "Agreements",
          href: `${base}/agreements`,
          icon: "FileText",
          badge: "TBA",
          subpages: [
            {
              label: "Task agreement",
              href: `${base}/agreements/dpp`,
              badge: "TBA",
            },
            {
              label: "Activity agreement",
              href: `${base}/agreements/dpc`,
              badge: "TBA",
            },
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
          badge: "TBA",
        },
        {
          label: "Payroll posting",
          href: `${base}/payroll-posting`,
          icon: "Workflow",
          badge: "TBA",
        },
        {
          label: "Attendance",
          href: `${base}/attendance`,
          icon: "CalendarIcon",
          badge: "TBA",
        },
        {
          label: "Sickness e-filing",
          href: `${base}/e-davky`,
          icon: "Activity",
          badge: "TBA",
        },
        {
          label: "Payroll reports",
          href: `${base}/payroll-reports`,
          icon: "FileSpreadsheet",
          badge: "TBA",
          subpages: [
            {
              label: "Income-tax reconciliation",
              href: `${base}/payroll-reports/income-tax`,
              badge: "TBA",
            },
            {
              label: "Withholding-tax reconciliation",
              href: `${base}/payroll-reports/withholding`,
              badge: "TBA",
            },
            {
              label: "Health insurance",
              href: `${base}/payroll-reports/health`,
              badge: "TBA",
            },
            {
              label: "Social insurance",
              href: `${base}/payroll-reports/social`,
              badge: "TBA",
            },
            {
              label: "Tax statements",
              href: `${base}/payroll-reports/tax`,
              badge: "TBA",
            },
            {
              label: "Sick-pay",
              href: `${base}/payroll-reports/sick-pay`,
              badge: "TBA",
            },
          ],
        },
        {
          label: "Payroll sheets",
          href: `${base}/payroll-sheets`,
          icon: "ClipboardIcon",
          badge: "TBA",
        },
        {
          label: "Pension record",
          href: `${base}/eldp`,
          icon: "IdCard",
          badge: "TBA",
        },
      ],
    },
  ]
}
