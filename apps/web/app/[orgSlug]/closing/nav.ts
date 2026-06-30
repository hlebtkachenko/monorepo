import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

/**
 * Closing module sidebar nav. Derived from `docs/specs/SITEMAP.md` (Closing —
 * the unified period-close cockpit, THE UVP). `base` = `/${orgSlug}/closing`.
 *
 * The per-obligation close flows (VAT/payroll/income-tax/year-end steps) are
 * opened INSIDE the cockpit — they are NOT nav pages. Nav = Overview · Calendar
 * · Archive only.
 */
export function closingNav(base: string): SidebarNavEntry[] {
  return [
    { label: "Overview", href: base, icon: "CalendarClock" },
    { label: "Calendar", href: `${base}/calendar`, icon: "CalendarIcon" },
    { label: "Archive", href: `${base}/archive`, icon: "Archive" },
  ]
}
