import { orgHref, orgRelativePath } from "./href"

/**
 * Build the destination URL when switching from the current org to another,
 * preserving *where the user is* (the in-org sub-path) instead of dumping them
 * on the target org root.
 *
 * Static route segments (module / page / subpage) are identical across every
 * org, so the sub-path carries over verbatim: on `/o/acme/company/periods`,
 * switching to `north` lands on `/o/north/company/periods`. If the target org
 * lacks that exact page (e.g. a trailing record-id that belongs to the source
 * org), its own routing / `not-found` handles it — preserving the path is the
 * desired behavior, so unlike the legacy `app/_components/org-switch-path`
 * helper this does NOT peel record-id tails.
 *
 * The query string is dropped: `?period=` is org-scoped (period ids belong to
 * one org, and the target org self-resolves its own active period), and any
 * other query is a per-page/record handle that does not survive an org change.
 *
 * `currentPathname` is a real path (e.g. from `usePathname()`), normally with no
 * query — we split it off defensively regardless. The `/o` prefix lives only in
 * `href.ts`; this helper composes `orgBasePath` / `orgHref` so it stays that way.
 *
 * @example orgSwitchTarget("/o/acme/company/periods", "acme", "north") // "/o/north/company/periods"
 * @example orgSwitchTarget("/o/acme?period=2026-Q1", "acme", "north")   // "/o/north"
 */
export function orgSwitchTarget(
  currentPathname: string,
  fromSlug: string,
  toSlug: string,
): string {
  return orgHref(toSlug, orgRelativePath(currentPathname, fromSlug))
}
