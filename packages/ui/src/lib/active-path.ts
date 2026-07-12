import type {
  SidebarNavEntry,
  SidebarNavPage,
} from "@workspace/ui/blocks/sidebar-panel"

/**
 * Longest-prefix active-route match. `/acme/finance/123` matches `/acme/finance`
 * over `/acme`; an exact path matches too. Returns the longest matching href,
 * or `null` when nothing matches or no path is given.
 *
 * Single source for the rail, the sidebar nav, and the footer so their active
 * highlights can never diverge for the same URL.
 */
export function longestPrefixMatch(
  hrefs: string[],
  currentPath?: string,
): string | null {
  if (!currentPath) return null
  let best: string | null = null
  for (const href of hrefs) {
    const matches =
      currentPath === href ||
      currentPath.startsWith(href.endsWith("/") ? href : `${href}/`)
    if (matches && (best === null || href.length > best.length)) best = href
  }
  return best
}

/** Flatten a sidebar tree to its `{ href, label }` leaves (pages + subpages). */
export function navLeaves(
  nav: SidebarNavEntry[],
): { href: string; label: string }[] {
  const out: { href: string; label: string }[] = []
  for (const entry of nav) {
    const pages: SidebarNavPage[] = "href" in entry ? [entry] : entry.pages
    for (const page of pages) {
      out.push({ href: page.href, label: page.label })
      for (const sub of page.subpages ?? [])
        out.push({ href: sub.href, label: sub.label })
    }
  }
  return out
}

/**
 * Title for a content-panel header: the active page's label (longest-prefix
 * match over the tree's flattened leaves). Shared by every tier's nav config
 * (org, workspace) so title resolution can't diverge between them.
 */
export function activeNavTitle(
  nav: SidebarNavEntry[],
  pathname: string | undefined,
): string | undefined {
  const leaves = navLeaves(nav)
  const best = longestPrefixMatch(
    leaves.map((leaf) => leaf.href),
    pathname,
  )
  return leaves.find((leaf) => leaf.href === best)?.label
}
