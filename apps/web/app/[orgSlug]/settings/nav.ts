import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

/**
 * Settings module sidebar nav. Derived from `docs/specs/SITEMAP.md` (Settings —
 * org-general config only). `base` = `/${orgSlug}/settings`.
 *
 * Module-specific config lives in its module (chart/posting → Accounting, etc).
 * Codebooks (Document types/Constant symbols/Payment methods/Units/Tags) and the
 * seeded read-only Law tables are each one page with tabs, not many leaves.
 */
export function settingsNav(base: string): SidebarNavEntry[] {
  return [
    { label: "Overview", href: base, icon: "Settings" },
    {
      label: "Organization",
      pages: [
        { label: "Identity", href: `${base}/identity`, icon: "IdCard" },
        {
          label: "Periods & fiscal year",
          href: `${base}/periods`,
          icon: "CalendarClock",
        },
        {
          label: "VAT status",
          href: `${base}/vat-status`,
          icon: "ReceiptEuro",
        },
        {
          label: "Business activities",
          href: `${base}/business-activities`,
          icon: "Briefcase",
        },
        { label: "Branding", href: `${base}/branding`, icon: "Palette" },
      ],
    },
    {
      label: "Reference",
      pages: [
        {
          label: "Number series",
          href: `${base}/number-series`,
          icon: "HashIcon",
        },
        { label: "FX rates", href: `${base}/fx-rates`, icon: "Globe" },
        { label: "Dimensions", href: `${base}/dimensions`, icon: "Shapes" },
        { label: "Codebooks", href: `${base}/codebooks`, icon: "BookOpen" },
        { label: "Law tables", href: `${base}/law-tables`, icon: "Shield" },
      ],
    },
    {
      label: "Access",
      pages: [{ label: "Members", href: `${base}/members`, icon: "Users" }],
    },
    {
      label: "Integrations",
      pages: [
        { label: "Data box", href: `${base}/data-box`, icon: "Mail" },
        {
          label: "Homebanking",
          href: `${base}/homebanking`,
          icon: "Building2",
        },
        {
          label: "ISDOC / iDoklad",
          href: `${base}/isdoc`,
          icon: "FileCodeIcon",
        },
      ],
    },
    {
      label: "System",
      pages: [
        {
          label: "AI budget & cooldown",
          href: `${base}/ai-budget`,
          icon: "Sparkles",
        },
        { label: "Reminders", href: `${base}/reminders`, icon: "Bell" },
        {
          label: "Recurring tasks",
          href: `${base}/recurring-tasks`,
          icon: "RefreshCw",
        },
        { label: "Background jobs", href: `${base}/jobs`, icon: "Workflow" },
        {
          label: "Submission log",
          href: `${base}/submission-log`,
          icon: "Send",
        },
        { label: "Recycle bin", href: `${base}/recycle-bin`, icon: "Trash2" },
        {
          label: "Action history",
          href: `${base}/action-history`,
          icon: "History",
        },
        {
          label: "Print templates",
          href: `${base}/print-templates`,
          icon: "Presentation",
        },
        {
          label: "Import / Export",
          href: `${base}/import-export`,
          icon: "Download",
        },
      ],
    },
  ]
}
