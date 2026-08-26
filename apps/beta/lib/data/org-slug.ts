/**
 * What may be an organization slug — the format rule and the reserved names.
 *
 * One module because the two questions have one answer at one moment: creation
 * time. A slug is immutable in practice the day the first link to it exists, so
 * everything that can make it a bad choice has to be asked before the INSERT.
 *
 * PURE MODULE — no `server-only`, no database. The scope seam reads the format
 * rule on every request, the /admin create form reads the reserved list to
 * explain a refusal, and the boundary test reads both.
 */

/**
 * Mirrors the `organization_slug_format` CHECK in 0000_init.sql: lowercase
 * alphanumerics and inner hyphens, no leading or trailing hyphen.
 *
 * The database is the authority. This copy exists so a slug that cannot
 * possibly exist is answered without a round trip — `requireScope` runs it on
 * every organization page — and so the create form can say WHY.
 */
const ORG_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
const ORG_SLUG_MAX_LENGTH = 64

export function isValidOrgSlugFormat(slug: string): boolean {
  return slug.length <= ORG_SLUG_MAX_LENGTH && ORG_SLUG_PATTERN.test(slug)
}

/**
 * Slugs an organization may never take.
 *
 * Every client book lives at `/[orgSlug]` (PR 09), which is a CATCH-ALL over
 * the root of this app, and a static route always wins that match in Next's
 * router. An organization created with the slug `admin` is therefore not a
 * privilege hole — it is worse in a quieter way: the book becomes permanently
 * unreachable, its members land on the office area or on a sign-in screen
 * instead, and the only symptom is a 404 nobody can explain. `sign-in`,
 * `setup` and `reset` have the same shape with more confusing symptoms.
 *
 * KEEPING THE LIST HONEST. It is written out rather than derived at runtime — a
 * filesystem walk inside a request would be slow, and wrong in a standalone
 * build where `app/` no longer exists. `org-slug.boundary.test.ts` does the
 * derivation instead: it walks the real `app/` tree, works out every static
 * top-level segment Next will actually serve (unwrapping route groups, skipping
 * private `_folders` and files), and fails if one of them is missing here. Add
 * a top-level route and the test tells you to add its segment.
 */
export const RESERVED_ORG_SLUGS: readonly string[] = Object.freeze([
  // Next's own asset namespace. Not a legal slug anyway (the CHECK refuses a
  // leading underscore); listed because a reader looking for it should find it.
  "_next",
  // Static top-level routes that exist today.
  "admin",
  "api",
  "healthz",
  "reset",
  "setup",
  "sign-in",
  // The forced-TOTP screen (PR 21). It is where an office account that has not
  // enrolled is sent from every gated layout, so a book squatting on the name
  // would make the mandate uncompletable, not merely the book unreachable.
  "zabezpeceni",
  // Forward reservations: names a portal of this shape always grows, and which
  // would be equally unrecoverable if handed out first. Cheap now, impossible
  // later.
  "assets",
  "favicon",
  "public",
  "robots",
  "sign-out",
  "sitemap",
  "static",
  "well-known",
])

const RESERVED = new Set(RESERVED_ORG_SLUGS)

/** Case-folded: the column stores slugs lowercase, request paths are not. */
export function isReservedOrgSlug(slug: string): boolean {
  return RESERVED.has(slug.trim().toLowerCase())
}
