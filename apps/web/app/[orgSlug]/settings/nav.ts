import type { SidebarNavEntry } from "@workspace/ui/blocks/sidebar-panel"

/**
 * Settings module sidebar nav. Derived from `docs/specs/SITEMAP.md` (Settings —
 * org-general config only). `base` = `/${orgSlug}/settings`. Depth-3.
 *
 * Module-specific config lives in its module (chart/posting → Accounting).
 * `tba: true` = not-yet-built placeholder; remove when the real body ships.
 */
export function settingsNav(base: string): SidebarNavEntry[] {
  return [
    { label: "Overview", href: base, icon: "Settings", tba: true },
    {
      label: "Organisation",
      pages: [
        {
          label: "Identity",
          href: `${base}/identity`,
          icon: "IdCard",
        },
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
          label: "Tax profile",
          href: `${base}/tax-profile`,
          icon: "Users",
        },
        {
          label: "Business activities",
          href: `${base}/business-activities`,
          icon: "Briefcase",
          tba: true,
        },
        {
          label: "Branding",
          href: `${base}/branding`,
          icon: "Palette",
          tba: true,
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
        },
        {
          label: "FX rates",
          href: `${base}/fx-rates`,
          icon: "Globe",
          tba: true,
          subpages: [
            { label: "Method", href: `${base}/fx-rates/method`, tba: true },
            {
              label: "Central bank feed",
              href: `${base}/fx-rates/feed`,
              tba: true,
            },
          ],
        },
        {
          label: "Dimensions",
          href: `${base}/dimensions`,
          icon: "Shapes",
          tba: true,
          subpages: [
            {
              label: "Cost centres",
              href: `${base}/dimensions/cost-centers`,
              tba: true,
            },
            { label: "Jobs", href: `${base}/dimensions/jobs`, tba: true },
            {
              label: "Activities",
              href: `${base}/dimensions/activities`,
              tba: true,
            },
          ],
        },
        {
          label: "Codebooks",
          href: `${base}/codebooks`,
          icon: "BookOpen",
          tba: true,
          subpages: [
            {
              label: "Document types",
              href: `${base}/codebooks/document-types`,
              tba: true,
            },
            {
              label: "Constant symbols",
              href: `${base}/codebooks/constant-symbols`,
              tba: true,
            },
            {
              label: "Payment methods",
              href: `${base}/codebooks/payment-methods`,
              tba: true,
            },
            { label: "Units", href: `${base}/codebooks/units`, tba: true },
            { label: "Tags", href: `${base}/codebooks/tags`, tba: true },
          ],
        },
        {
          label: "Law tables",
          href: `${base}/law-tables`,
          icon: "Shield",
          tba: true,
          subpages: [
            {
              label: "VAT rates",
              href: `${base}/law-tables/vat-rates`,
              tba: true,
            },
            {
              label: "Depreciation groups",
              href: `${base}/law-tables/depreciation-groups`,
              tba: true,
            },
            {
              label: "NACE codes",
              href: `${base}/law-tables/cz-nace`,
              tba: true,
            },
            {
              label: "Account groups",
              href: `${base}/law-tables/account-groups`,
              tba: true,
            },
            {
              label: "Directive chart",
              href: `${base}/law-tables/directive-chart`,
              tba: true,
            },
            {
              label: "Legal forms",
              href: `${base}/law-tables/legal-forms`,
              tba: true,
            },
            {
              label: "Regimes",
              href: `${base}/law-tables/regimes`,
              tba: true,
            },
            {
              label: "Size categories",
              href: `${base}/law-tables/sizes`,
              tba: true,
            },
            {
              label: "Countries & postcodes",
              href: `${base}/law-tables/countries`,
              tba: true,
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
          tba: true,
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
        },
        {
          label: "Homebanking",
          href: `${base}/homebanking`,
          icon: "Building2",
          tba: true,
        },
        {
          label: "ISDOC / iDoklad",
          href: `${base}/isdoc`,
          icon: "FileCodeIcon",
          tba: true,
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
          tba: true,
        },
        {
          label: "Reminders",
          href: `${base}/reminders`,
          icon: "Bell",
          tba: true,
        },
        {
          label: "Recurring tasks",
          href: `${base}/recurring-tasks`,
          icon: "RefreshCw",
          tba: true,
        },
        {
          label: "Background jobs",
          href: `${base}/jobs`,
          icon: "Workflow",
          tba: true,
        },
        {
          label: "Submission log",
          href: `${base}/submission-log`,
          icon: "Send",
          tba: true,
        },
        {
          label: "Recycle bin",
          href: `${base}/recycle-bin`,
          icon: "Trash2",
          tba: true,
        },
        {
          label: "Action history",
          href: `${base}/action-history`,
          icon: "History",
          tba: true,
        },
        {
          label: "Print templates",
          href: `${base}/print-templates`,
          icon: "Presentation",
          tba: true,
        },
        {
          label: "Import / Export",
          href: `${base}/import-export`,
          icon: "Download",
          tba: true,
        },
      ],
    },
    {
      label: "Debug",
      pages: [
        {
          label: "Debug",
          href: `${base}/debug`,
          icon: "Bug",
          subpages: [
            {
              label: "Archetype Blank",
              href: `${base}/debug/archetype-blank`,
            },
            {
              label: "Section Form",
              href: `${base}/debug/section-form`,
            },
          ],
        },
      ],
    },
  ]
}
