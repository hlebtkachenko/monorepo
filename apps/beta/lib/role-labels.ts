import type { BetaOrgRole } from "@/db/schema"
import type { BetaMessageKey } from "@/i18n/messages"

/**
 * Client-facing role labels — the org-side twin of
 * `app/admin/_components/labels.ts`'s `ROLE_LABEL_KEY`.
 *
 * Kept as a SEPARATE map rather than shared: `app/admin/_components/` is a
 * private folder inside the office-only `/admin` route tree, and its keys are
 * namespaced `admin.*` — reusing `admin.roleOwner` on a client-facing org page
 * would render the right Czech text through the wrong audience's namespace,
 * and a future admin-only wording tweak would silently change the client
 * greeting too. The four strings are duplicated (`org.role*` in
 * `messages/cs.json`, "org" being the client-facing namespace) rather than the
 * mapping being imported across that boundary. If the two ever need to say
 * something different per audience, they already can; if they drift by
 * accident, both places need the same one-line fix.
 *
 * The DISPLAY labels are the spec's (§2.6.1, §2.10), not the enum's: `owner`
 * shows as "Účetní", `member` as "Pracovník firmy (vedení)". `satisfies
 * Record<...>` makes a new enum value a compile error here rather than a
 * blank cell.
 */
export const ORG_ROLE_LABEL_KEY = {
  owner: "org.roleOwner",
  admin: "org.roleAdmin",
  member: "org.roleMember",
  guest: "org.roleGuest",
} as const satisfies Record<BetaOrgRole, BetaMessageKey>
