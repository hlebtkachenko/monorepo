import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

/**
 * HR module sidebar nav. Derived from `docs/specs/SITEMAP.md` (HR — people &
 * payroll; mock — no v2 payroll entity yet). `base` = `/${orgSlug}/hr`.
 *
 * People/Payroll gated on `has_employees` (gate not wired yet — superset now).
 * Vehicles/fleet moved to Assets. `tba: true` = not-yet-built placeholder.
 */
export function hrNav(base: string): SidebarNavEntry[] {
  return [
    { label: "Overview", href: base, icon: "Users", tba: true },
    // AI-prepared payroll runs awaiting a human's review + approval.
    {
      label: "Payroll approvals",
      href: `${base}/approvals`,
      icon: "ListChecksIcon",
      tba: true,
    },
    {
      // TODO(regime): gate by has_employees.
      label: "People",
      pages: [
        {
          label: "Employees",
          href: `${base}/employees`,
          icon: "User",
          tba: true,
        },
        {
          label: "Agreements",
          href: `${base}/agreements`,
          icon: "FileText",
          tba: true,
          subpages: [
            {
              label: "Task agreement",
              href: `${base}/agreements/dpp`,
              tba: true,
            },
            {
              label: "Activity agreement",
              href: `${base}/agreements/dpc`,
              tba: true,
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
          tba: true,
        },
        {
          label: "Payroll posting",
          href: `${base}/payroll-posting`,
          icon: "Workflow",
          tba: true,
        },
        {
          label: "Attendance",
          href: `${base}/attendance`,
          icon: "CalendarIcon",
          tba: true,
        },
        {
          label: "Sickness e-filing",
          href: `${base}/e-davky`,
          icon: "Activity",
          tba: true,
        },
        {
          label: "Payroll reports",
          href: `${base}/payroll-reports`,
          icon: "FileSpreadsheet",
          tba: true,
          subpages: [
            {
              label: "Income-tax reconciliation",
              href: `${base}/payroll-reports/income-tax`,
              tba: true,
            },
            {
              label: "Withholding-tax reconciliation",
              href: `${base}/payroll-reports/withholding`,
              tba: true,
            },
            {
              label: "Health insurance",
              href: `${base}/payroll-reports/health`,
              tba: true,
            },
            {
              label: "Social insurance",
              href: `${base}/payroll-reports/social`,
              tba: true,
            },
            {
              label: "Tax statements",
              href: `${base}/payroll-reports/tax`,
              tba: true,
            },
            {
              label: "Sick-pay",
              href: `${base}/payroll-reports/sick-pay`,
              tba: true,
            },
          ],
        },
        {
          label: "Payroll sheets",
          href: `${base}/payroll-sheets`,
          icon: "ClipboardIcon",
          tba: true,
        },
        {
          label: "Pension record",
          href: `${base}/eldp`,
          icon: "IdCard",
          tba: true,
        },
      ],
    },
  ]
}
