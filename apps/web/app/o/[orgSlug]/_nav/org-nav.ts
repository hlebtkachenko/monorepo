import type { RailMenuEntry } from "@workspace/ui/blocks/app-rail"
import type { SidebarNavEntry } from "@workspace/ui/blocks/sidebar-panel"

import { orgHref } from "@/lib/org/href"

/**
 * Nav for the rebuilt org tree. Owned by this tree (never shared with the frozen
 * old tree), and deliberately MINIMAL: it starts with just the Company home and
 * grows one module at a time as pages are rebuilt in the execution phase. Every
 * href is built through `orgHref` so the temporary `/o` prefix lives in one
 * place. This nav does NOT feed the `/v1/structure` codegen during coexistence
 * (that stays on the old nav until the flip).
 */

/** Rail menu — the modules. Grows as each module is rebuilt. */
export function orgRailNav(slug: string): RailMenuEntry[] {
  return [{ label: "Company", icon: "Goal", href: orgHref(slug) }]
}

/** Sidebar tree for the Company home. */
export function companyNav(slug: string): SidebarNavEntry[] {
  return [{ label: "Overview", icon: "Goal", href: orgHref(slug) }]
}
