import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

/**
 * Settings module sidebar nav. Derived from `docs/specs/SITEMAP.md` (Settings —
 * org-general config only). `base` = `/${orgSlug}/settings`. Depth-3.
 *
 * Module-specific config lives in its module (chart/posting → Accounting).
 * `badge: "TBA"` = not-yet-built placeholder; remove when the real body ships.
 */
export function settingsNav(base: string): SidebarNavEntry[] {
  return [
    { label: "Overview", href: base, icon: "Settings", badge: "TBA" },
    {
      label: "Organisation",
      pages: [
        {
          label: "Identity",
          href: `${base}/identity`,
          icon: "IdCard",
          badge: "TBA",
        },
        {
          label: "Periods & fiscal year",
          href: `${base}/periods`,
          icon: "CalendarClock",
          badge: "TBA",
        },
        {
          label: "VAT status",
          href: `${base}/vat-status`,
          icon: "ReceiptEuro",
          badge: "TBA",
        },
        {
          label: "Business activities",
          href: `${base}/business-activities`,
          icon: "Briefcase",
          badge: "TBA",
        },
        {
          label: "Branding",
          href: `${base}/branding`,
          icon: "Palette",
          badge: "TBA",
        },
      ],
    },
    {
      label: "Reference",
      pages: [
        {
          label: "Number series",
          href: `${base}/number-series`,
          icon: "HashIcon",
          badge: "TBA",
        },
        {
          label: "FX rates",
          href: `${base}/fx-rates`,
          icon: "Globe",
          badge: "TBA",
          subpages: [
            { label: "Method", href: `${base}/fx-rates/method`, badge: "TBA" },
            {
              label: "Central bank feed",
              href: `${base}/fx-rates/feed`,
              badge: "TBA",
            },
          ],
        },
        {
          label: "Dimensions",
          href: `${base}/dimensions`,
          icon: "Shapes",
          badge: "TBA",
          subpages: [
            {
              label: "Cost centres",
              href: `${base}/dimensions/cost-centers`,
              badge: "TBA",
            },
            { label: "Jobs", href: `${base}/dimensions/jobs`, badge: "TBA" },
            {
              label: "Activities",
              href: `${base}/dimensions/activities`,
              badge: "TBA",
            },
          ],
        },
        {
          label: "Codebooks",
          href: `${base}/codebooks`,
          icon: "BookOpen",
          badge: "TBA",
          subpages: [
            {
              label: "Document types",
              href: `${base}/codebooks/document-types`,
              badge: "TBA",
            },
            {
              label: "Constant symbols",
              href: `${base}/codebooks/constant-symbols`,
              badge: "TBA",
            },
            {
              label: "Payment methods",
              href: `${base}/codebooks/payment-methods`,
              badge: "TBA",
            },
            { label: "Units", href: `${base}/codebooks/units`, badge: "TBA" },
            { label: "Tags", href: `${base}/codebooks/tags`, badge: "TBA" },
          ],
        },
        {
          label: "Law tables",
          href: `${base}/law-tables`,
          icon: "Shield",
          badge: "TBA",
          subpages: [
            {
              label: "VAT rates",
              href: `${base}/law-tables/vat-rates`,
              badge: "TBA",
            },
            {
              label: "Depreciation groups",
              href: `${base}/law-tables/depreciation-groups`,
              badge: "TBA",
            },
            {
              label: "NACE codes",
              href: `${base}/law-tables/cz-nace`,
              badge: "TBA",
            },
            {
              label: "Account groups",
              href: `${base}/law-tables/account-groups`,
              badge: "TBA",
            },
            {
              label: "Directive chart",
              href: `${base}/law-tables/directive-chart`,
              badge: "TBA",
            },
            {
              label: "Legal forms",
              href: `${base}/law-tables/legal-forms`,
              badge: "TBA",
            },
            {
              label: "Regimes",
              href: `${base}/law-tables/regimes`,
              badge: "TBA",
            },
            {
              label: "Size categories",
              href: `${base}/law-tables/sizes`,
              badge: "TBA",
            },
            {
              label: "Countries & postcodes",
              href: `${base}/law-tables/countries`,
              badge: "TBA",
            },
          ],
        },
      ],
    },
    {
      label: "Access",
      pages: [
        {
          label: "Members",
          href: `${base}/members`,
          icon: "Users",
          badge: "TBA",
        },
      ],
    },
    {
      label: "Integrations",
      pages: [
        {
          label: "Data box",
          href: `${base}/data-box`,
          icon: "Mail",
          badge: "TBA",
        },
        {
          label: "Homebanking",
          href: `${base}/homebanking`,
          icon: "Building2",
          badge: "TBA",
        },
        {
          label: "ISDOC / iDoklad",
          href: `${base}/isdoc`,
          icon: "FileCodeIcon",
          badge: "TBA",
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
          badge: "TBA",
        },
        {
          label: "Reminders",
          href: `${base}/reminders`,
          icon: "Bell",
          badge: "TBA",
        },
        {
          label: "Recurring tasks",
          href: `${base}/recurring-tasks`,
          icon: "RefreshCw",
          badge: "TBA",
        },
        {
          label: "Background jobs",
          href: `${base}/jobs`,
          icon: "Workflow",
          badge: "TBA",
        },
        {
          label: "Submission log",
          href: `${base}/submission-log`,
          icon: "Send",
          badge: "TBA",
        },
        {
          label: "Recycle bin",
          href: `${base}/recycle-bin`,
          icon: "Trash2",
          badge: "TBA",
        },
        {
          label: "Action history",
          href: `${base}/action-history`,
          icon: "History",
          badge: "TBA",
        },
        {
          label: "Print templates",
          href: `${base}/print-templates`,
          icon: "Presentation",
          badge: "TBA",
        },
        {
          label: "Import / Export",
          href: `${base}/import-export`,
          icon: "Download",
          badge: "TBA",
        },
      ],
    },
  ]
}
