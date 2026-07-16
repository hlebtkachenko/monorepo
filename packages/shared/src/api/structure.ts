import { z } from "zod"

import "./zod-openapi"

/**
 * `GET /v1/structure` + `GET /v1/structure/archetypes` — the org application's
 * information architecture, exposed for agents to discover **outside the GUI**.
 *
 * The web app (`apps/web`) ships a navigable sidebar for ten org modules
 * (Company, Accounting, Records, Finance, HR, Assets, Closing, Reports,
 * Directory, Settings) plus a catalog of content-panel layout archetypes. This
 * surface makes that structure programmatic — an agent can enumerate the
 * modules, drill each module's page tree, read each page's build-status, and
 * learn which layout archetype a page uses, without driving a browser.
 *
 * These are PUBLIC, tenant-agnostic ops (the IA is the same for every org):
 * documentation-tier, no API key, mirroring `GET /v1/status`.
 *
 * Source of truth: the module structure is generated from the typed `nav.ts`
 * trees (`apps/web/app/[orgSlug]/_nav`) by `scripts/gen-structure.ts` — never
 * hand-edited, never parsed from the `SITEMAP.md` prose. The archetype catalog
 * and the sparse per-page annotations below are authored here.
 */

/** The five content-panel layout archetypes (`docs/runbooks/APP-SHELL-PANELS.md`). */
export const ARCHETYPE_KEYS = [
  "Table",
  "Blank",
  "Launchpad",
  "Dashboard",
  "Single",
] as const

export const ArchetypeKeySchema = z.enum(ARCHETYPE_KEYS).openapi({
  description:
    "Content-panel layout archetype. `Table` = dense list (toolbar + grid + " +
    "status bar); `Blank` = body only, no chrome; `Launchpad` = card grid to " +
    "subpages; `Dashboard` = KPI tiles + chart cards; `Single` = one record " +
    "(form panels + line-items).",
  example: "Table",
})
export type ArchetypeKey = z.infer<typeof ArchetypeKeySchema>

export const ArchetypeSchema = z
  .object({
    key: ArchetypeKeySchema,
    label: z.string().openapi({
      description: "Human-facing archetype name.",
      example: "Table",
    }),
    slots: z.string().openapi({
      description: "Which `ContentPanel` slots this archetype fills.",
      example: "toolbar + body + statusBar (+ inspector, footer)",
    }),
    useWhen: z.string().openapi({
      description: "When to pick this archetype for a page.",
      example: "Dense list pages (invoices, transactions).",
    }),
    demoRoute: z
      .string()
      .nullable()
      .openapi({
        description:
          "Route segment of the dev-only demo page for this archetype, or " +
          "null if none. The standalone /[orgSlug]/demo-* demos were retired; " +
          "Table and Blank now live as settings/debug archetype pages, and " +
          "Launchpad/Dashboard/Single are pending rebuild (see issue #787), " +
          "so this is currently null for every archetype.",
        example: null,
      }),
  })
  .openapi({ description: "One content-panel layout archetype." })
export type Archetype = z.infer<typeof ArchetypeSchema>

export const ListArchetypesResponseSchema = z
  .object({
    archetypes: z.array(ArchetypeSchema).openapi({
      description: "The five content-panel layout archetypes.",
    }),
  })
  .openapi({
    description:
      "`GET /v1/structure/archetypes` — the layout-archetype catalog.",
  })
export type ListArchetypesResponse = z.infer<
  typeof ListArchetypesResponseSchema
>

export const NavSubpageSchema = z
  .object({
    label: z.string().openapi({
      description: "Subpage label as shown in the sidebar.",
      example: "VAT return",
    }),
    route: z.string().openapi({
      description:
        "Route relative to the org root (no org slug). Prefix with " +
        "`/{orgSlug}/` to build a URL.",
      example: "closing/vat/dap",
    }),
    tba: z.boolean().openapi({
      description:
        "Build-status flag. `true` = not-yet-built placeholder (renders a " +
        "muted TBA chip in the GUI); `false` = shipped.",
      example: true,
    }),
    archetype: ArchetypeKeySchema.nullable().openapi({
      description:
        "The layout archetype this page uses, or null when not yet assigned " +
        "(most pages are placeholders today).",
      example: null,
    }),
    purpose: z.string().nullable().openapi({
      description: "One-line description of the page, or null.",
      example: null,
    }),
  })
  .openapi({ description: "A leaf subpage under a page (3rd nav level)." })
export type NavSubpage = z.infer<typeof NavSubpageSchema>

export const NavPageSchema = z
  .object({
    group: z
      .string()
      .nullable()
      .openapi({
        description:
          "Sidebar group heading this page sits under, or null when the page is " +
          "pinned / ungrouped.",
        example: "Obligations",
      }),
    label: z.string().openapi({
      description: "Page label as shown in the sidebar.",
      example: "VAT",
    }),
    route: z.string().openapi({
      description:
        "Route relative to the org root (no org slug). Empty string is the " +
        "module index.",
      example: "closing/vat",
    }),
    icon: z.string().openapi({
      description: "Lucide/Phosphor icon name for the page.",
      example: "ReceiptEuro",
    }),
    tba: z.boolean().openapi({
      description: "Build-status flag — `true` = not-yet-built placeholder.",
      example: true,
    }),
    archetype: ArchetypeKeySchema.nullable().openapi({
      description: "Layout archetype, or null when not yet assigned.",
      example: null,
    }),
    purpose: z.string().nullable().openapi({
      description: "One-line description of the page, or null.",
      example: null,
    }),
    subpages: z.array(NavSubpageSchema).openapi({
      description:
        "Leaf subpages under this page. Empty when the page is a leaf.",
    }),
  })
  .openapi({ description: "A navigable page within a module (2nd nav level)." })
export type NavPage = z.infer<typeof NavPageSchema>

export const ModuleStructureSchema = z
  .object({
    key: z.string().openapi({
      description:
        "Module route key (first path segment after the org slug). Empty " +
        "string is the Company index module.",
      example: "closing",
    }),
    label: z.string().openapi({
      description: "Module label as shown in the rail.",
      example: "Closing",
    }),
    route: z.string().openapi({
      description: "Module route relative to the org root. Empty for Company.",
      example: "closing",
    }),
    icon: z.string().openapi({
      description: "Rail icon name for the module.",
      example: "CalendarClock",
    }),
    pages: z.array(NavPageSchema).openapi({
      description:
        "Flat list of the module's pages, each carrying its `group` heading " +
        "(null when ungrouped) and any subpages.",
    }),
  })
  .openapi({ description: "One org rail module and its page tree." })
export type ModuleStructure = z.infer<typeof ModuleStructureSchema>

export const GetStructureResponseSchema = z
  .object({
    modules: z.array(ModuleStructureSchema).openapi({
      description: "The ten org rail modules, in rail order.",
    }),
  })
  .openapi({
    description:
      "`GET /v1/structure` — the full org application structure (modules → " +
      "pages → subpages).",
  })
export type GetStructureResponse = z.infer<typeof GetStructureResponseSchema>

/**
 * The archetype catalog. Static, authored from the archetype table in
 * `docs/runbooks/APP-SHELL-PANELS.md`. The standalone `/[orgSlug]/demo-*`
 * reference routes were retired: Table and Blank live as `settings/debug`
 * archetype pages, and Launchpad/Dashboard/Single are pending rebuild
 * (issue #787), so `demoRoute` is null for every archetype for now.
 */
export const ARCHETYPES: Archetype[] = [
  {
    key: "Table",
    label: "Table",
    slots: "toolbar + body + statusBar (+ inspector, footer)",
    useWhen:
      "Dense list pages (invoices, transactions). The wired gold standard.",
    demoRoute: null,
  },
  {
    key: "Blank",
    label: "Blank",
    slots: "body only (no chrome)",
    useWhen: "A one-off body straight on the layout. The zero-slot case.",
    demoRoute: null,
  },
  {
    key: "Launchpad",
    label: "Launchpad",
    slots: "body only (LaunchpadGrid)",
    useWhen: "Folder / overview pages — a grid of cards to subpages.",
    demoRoute: null,
  },
  {
    key: "Dashboard",
    label: "Dashboard",
    slots: "body only (DashboardGrid + chart cards)",
    useWhen:
      "Analytics — KPI tiles, chart cards, period control, a selectable matrix.",
    demoRoute: null,
  },
  {
    key: "Single",
    label: "Single",
    slots: "body only (RecordWorkspace)",
    useWhen:
      "One record on show — side-by-side form panels + an editable line-items grid + live totals.",
    demoRoute: null,
  },
]

/**
 * Sparse per-route annotations merged into the generated structure snapshot by
 * `scripts/gen-structure.ts`. Keyed by org-relative route (no org slug).
 *
 * Most org pages are `ModulePage` placeholders with no assigned archetype yet,
 * so this map is intentionally sparse — a route absent here yields
 * `archetype: null` / `purpose: null`. Add entries as pages get a real
 * archetype/purpose; the gen script fails if a key here is not a real nav
 * route, so this can never drift stale.
 */
export const PAGE_ANNOTATIONS: Record<
  string,
  { archetype?: ArchetypeKey; purpose?: string }
> = {}
