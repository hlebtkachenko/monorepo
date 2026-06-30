import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

/**
 * Settings module sidebar nav. Derived from `docs/specs/SITEMAP.md` (Settings —
 * org-general config only). `base` = `/${orgSlug}/settings`.
 *
 * Depth-3: the codebooks, the seeded read-only law tables, dimensions and FX
 * are parent Pages whose individual tables are Subpages (real routes).
 * Module-specific config still lives in its module (chart/posting → Accounting).
 */
export function settingsNav(base: string): SidebarNavEntry[] {
  return [
    { label: "Overview", href: base, icon: "Settings" },
    {
      label: "Organisation",
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
        {
          label: "FX rates",
          href: `${base}/fx-rates`,
          icon: "Globe",
          subpages: [
            { label: "Method", href: `${base}/fx-rates/method` },
            { label: "Central bank feed", href: `${base}/fx-rates/feed` },
          ],
        },
        {
          label: "Dimensions",
          href: `${base}/dimensions`,
          icon: "Shapes",
          subpages: [
            { label: "Cost centres", href: `${base}/dimensions/cost-centers` },
            { label: "Jobs", href: `${base}/dimensions/jobs` },
            { label: "Activities", href: `${base}/dimensions/activities` },
          ],
        },
        {
          label: "Codebooks",
          href: `${base}/codebooks`,
          icon: "BookOpen",
          subpages: [
            {
              label: "Document types",
              href: `${base}/codebooks/document-types`,
            },
            {
              label: "Constant symbols",
              href: `${base}/codebooks/constant-symbols`,
            },
            {
              label: "Payment methods",
              href: `${base}/codebooks/payment-methods`,
            },
            { label: "Units", href: `${base}/codebooks/units` },
            { label: "Tags", href: `${base}/codebooks/tags` },
          ],
        },
        {
          label: "Law tables",
          href: `${base}/law-tables`,
          icon: "Shield",
          subpages: [
            { label: "VAT rates", href: `${base}/law-tables/vat-rates` },
            {
              label: "Depreciation groups",
              href: `${base}/law-tables/depreciation-groups`,
            },
            { label: "NACE codes", href: `${base}/law-tables/cz-nace` },
            {
              label: "Account groups",
              href: `${base}/law-tables/account-groups`,
            },
            {
              label: "Directive chart",
              href: `${base}/law-tables/directive-chart`,
            },
            { label: "Legal forms", href: `${base}/law-tables/legal-forms` },
            { label: "Regimes", href: `${base}/law-tables/regimes` },
            { label: "Size categories", href: `${base}/law-tables/sizes` },
            {
              label: "Countries & postcodes",
              href: `${base}/law-tables/countries`,
            },
          ],
        },
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
