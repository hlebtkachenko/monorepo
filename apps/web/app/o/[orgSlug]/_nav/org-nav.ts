import type { RailMenuItem } from "@workspace/ui/blocks/app-rail"
import type { SidebarNavPage } from "@workspace/ui/blocks/sidebar-panel"

import { orgHref } from "@/lib/org/href"

/**
 * Nav for the rebuilt org tree. Owned by this tree (never shared with the frozen
 * old tree), and deliberately MINIMAL: it starts with just the Company home and
 * grows one module at a time as pages are rebuilt in the execution phase. Every
 * href is built through `orgHref` so the temporary `/o` prefix lives in one
 * place. This nav does NOT feed the `/v1/structure` codegen during coexistence
 * (that stays on the old nav until the flip).
 *
 * Labels are data-defined as i18n KEYS (`org.nav.*`), never literal strings —
 * `org-shell.tsx` resolves them through `useTranslations("org.nav")` before
 * handing the entries to the `@workspace/ui` rail/sidebar (which expect
 * already-resolved `label` strings). This keeps every user-facing string in the
 * catalog while the nav stays a plain data list.
 */

/** i18n key (under `org.nav`) for a nav entry's visible label. */
export type OrgNavLabelKey = "company" | "overview" | "periods" | "debug"

/** A rail entry as authored here: the i18n label key plus the rest of the item. */
export type OrgRailNavItem = Omit<RailMenuItem, "label"> & {
  labelKey: OrgNavLabelKey
}

/** A sidebar page as authored here: the i18n label key plus the rest. */
export type OrgSidebarNavItem = Omit<SidebarNavPage, "label"> & {
  labelKey: OrgNavLabelKey
}

/**
 * Rail menu — the modules. Grows as each module is rebuilt.
 *
 * `options.debug` appends the dev/admin-only Debug module. It is pushed AFTER
 * every real module so its trailing position is STRUCTURAL, not incidental:
 * whatever modules are added above, Debug stays the last rail entry. Visibility
 * is decided by the caller (`org-shell.tsx`) — a dev build or an allowlisted
 * workspace only; a normal production user never gets `debug: true`.
 */
export function orgRailNav(
  slug: string,
  options: { debug?: boolean } = {},
): OrgRailNavItem[] {
  const modules: OrgRailNavItem[] = [
    { labelKey: "company", icon: "Goal", href: orgHref(slug) },
  ]
  if (options.debug) {
    modules.push({
      labelKey: "debug",
      icon: "ChevronsLeftRightSquare",
      href: orgHref(slug, "debug"),
    })
  }
  return modules
}

/** Sidebar tree for the Company module. */
export function companyNav(slug: string): OrgSidebarNavItem[] {
  return [
    { labelKey: "overview", icon: "Goal", href: orgHref(slug) },
    {
      labelKey: "periods",
      icon: "CalendarClock",
      href: orgHref(slug, "company/periods"),
    },
  ]
}

/** Sidebar tree for the Debug module — a single Overview entry. */
export function debugNav(slug: string): OrgSidebarNavItem[] {
  return [
    {
      labelKey: "overview",
      icon: "ChevronsLeftRightSquare",
      href: orgHref(slug, "debug"),
    },
  ]
}
