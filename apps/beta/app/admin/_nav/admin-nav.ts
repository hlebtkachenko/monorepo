/**
 * The four sections of the office area (spec §3.5: "Organizace · Uživatelé ·
 * Setup-linky · Provoz").
 *
 * Labels are i18n KEYS, never literals, matching the rail's contract in
 * `app/_nav/beta-nav.ts`. Route segments are Czech like the rest of the app's
 * URLs, and every one of them is in `RESERVED_ORG_SLUGS`' derivation — but only
 * as children of `/admin`, which is itself the reserved top-level segment.
 */
type AdminNavLabelKey =
  "navOrganizations" | "navUsers" | "navSetupLinks" | "navOperations"

export type AdminNavItem = {
  readonly labelKey: AdminNavLabelKey
  readonly href: string
}

export const adminNav: readonly AdminNavItem[] = [
  { labelKey: "navOrganizations", href: "/admin" },
  { labelKey: "navUsers", href: "/admin/uzivatele" },
  { labelKey: "navSetupLinks", href: "/admin/odkazy" },
  { labelKey: "navOperations", href: "/admin/provoz" },
]

/**
 * Which entry a path belongs to. `/admin` is the index, so it matches only
 * exactly — otherwise it would light up for every child route.
 */
export function isActiveAdminNav(href: string, pathname: string): boolean {
  if (href === "/admin") {
    return pathname === "/admin" || pathname.startsWith("/admin/organizace")
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}
