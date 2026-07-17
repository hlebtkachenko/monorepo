/**
 * Build the destination path when switching from the current org to another,
 * preserving *where the user is* rather than dumping them on the target org
 * root.
 *
 * Static route segments (module / page / subpage) are identical across every
 * org, so they carry over safely. A trailing **record-id** segment is
 * org-scoped — that exact record does not exist under the target org — so it
 * (and anything after it) is dropped back to the enclosing subpage. The query
 * string is dropped for the same reason (`?inspect=<id>` is a record handle).
 *
 * Examples (target = "north"):
 *   /acme                              → /north
 *   /acme/accounting/ledger            → /north/accounting/ledger
 *   /acme/accounting/ledger/9f8c…?x=1  → /north/accounting/ledger
 *
 * `pathname` must be a real path (e.g. from `usePathname()`), no query — the
 * hook already strips it, but we defend anyway.
 */
export function orgSwitchPath(pathname: string, targetSlug: string): string {
  // Drop any query/hash a caller might have appended, then split.
  const clean = pathname.split(/[?#]/)[0] ?? ""
  const segments = clean.split("/").filter(Boolean)

  // segments[0] is the current org slug; everything after is the in-org path.
  const rest = segments.slice(1)

  // Peel record-id segments off the tail so we land on the deepest shared
  // (static) subpage, never on a record that belongs to the source org.
  while (rest.length > 0 && isRecordId(rest[rest.length - 1]!)) {
    rest.pop()
  }

  return "/" + [targetSlug, ...rest].join("/")
}

/**
 * Heuristic for "this segment identifies one org-scoped record" (a UUID,
 * an all-numeric id, or a long opaque token such as a ULID / nanoid). Static
 * route words ("accounting", "ledger", "settings", …) never match.
 */
function isRecordId(segment: string): boolean {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (uuid.test(segment)) return true
  if (/^\d+$/.test(segment)) return true
  // ULID/nanoid/opaque id: long and mixed, no human-word shape.
  if (/^[0-9A-Za-z_-]{20,}$/.test(segment)) return true
  return false
}
