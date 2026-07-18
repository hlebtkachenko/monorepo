/**
 * URL helpers for the rebuilt org UI tree.
 *
 * During the rebuild the new tree runs under a temporary `/o` prefix
 * (`apps/web/app/o/[orgSlug]/`) in parallel with the frozen old tree at
 * `apps/web/app/[orgSlug]/`. Every link the new tree builds MUST go through
 * `orgHref` / `orgBasePath` so the prefix lives in exactly one place: at the
 * flip, `ORG_PREFIX` becomes `""` and the tree is `git mv`'d to the canonical
 * path, with no link builder to hunt down.
 *
 * The old tree keeps its own hardcoded `/${slug}` links (it is frozen and not
 * this module's concern), so no per-tree threading is needed — the new tree is
 * the sole caller here.
 */

/** Temporary URL prefix for the new org tree. Becomes `""` at the flip. */
export const ORG_PREFIX = "/o"

/** The base path for an org home, e.g. `/o/acme`. */
export function orgBasePath(slug: string): string {
  return `${ORG_PREFIX}/${slug}`
}

/**
 * Build an org-scoped href.
 *
 * @param slug  the org slug
 * @param path  an org-relative path ("" = org home), leading slashes ignored
 * @param opts.period  optional active-period id, appended as `?period=`
 *
 * @example orgHref("acme")                                   // "/o/acme"
 * @example orgHref("acme", "accounting/journal")             // "/o/acme/accounting/journal"
 * @example orgHref("acme", "accounting/journal", { period }) // "/o/acme/accounting/journal?period=<id>"
 */
export function orgHref(
  slug: string,
  path = "",
  opts?: { period?: string | null },
): string {
  const clean = path.replace(/^\/+/, "")
  const base = clean ? `${orgBasePath(slug)}/${clean}` : orgBasePath(slug)
  const period = opts?.period
  return period ? `${base}?period=${encodeURIComponent(period)}` : base
}

/**
 * The in-org sub-path of a pathname — the inverse of `orgHref`. Strips the
 * `/o/<slug>` base (query/hash removed) and returns what follows, e.g.
 * `/o/acme/company/periods` → `"company/periods"`; the org home → `""`.
 *
 * The base is matched on a full segment boundary (`=== base` or `base + "/"`),
 * so a sibling slug that merely shares a prefix (`/o/acme-backup/x` under slug
 * `acme`) does NOT mis-strip to `-backup/x` — it returns `""`. Single home of
 * this logic so the org switcher and the period switcher can't diverge.
 */
export function orgRelativePath(pathname: string, slug: string): string {
  const clean = pathname.split(/[?#]/)[0] ?? ""
  const base = orgBasePath(slug)
  if (clean === base) return ""
  return clean.startsWith(`${base}/`) ? clean.slice(base.length + 1) : ""
}
