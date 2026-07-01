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
