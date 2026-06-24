"use client"

import { OrgSwitcher } from "@workspace/ui/blocks/app-header"

/**
 * Org-switcher surface wrapper — feeds the presentational `OrgSwitcher`
 * (packages/ui) its data, same pattern as `OrgSidebar` / `AppRailNav`.
 *
 * ── DATA SEAM (all values below are MOCK for visual review) ──────────────
 * Wire real data here when it exists (tracked in GitHub issue #394):
 *
 *  • currentOrg.name / role  → `resolveMembership()` (`app/[orgSlug]/
 *    layout.tsx`) returns `legalName` + `role`, but it is PRIVATE to the
 *    layout and not passed to the page — add a shared `getOrgIdentity(slug,
 *    userId)` helper or a page-level query (the page already does its own
 *    `getHeaderUser()`). NOTE: `role` is the lowercase DB enum
 *    (`owner|admin|member|agent|guest`); the prop wants a HUMAN-READABLE
 *    label, so map it here (owner → "Owner") — the component renders it
 *    verbatim.
 *  • currentOrg.memberCount  → `SELECT COUNT(*) FROM organization_membership
 *    WHERE organization_id = $1 AND active = true`.
 *  • recentOrgs              → `listWorkspacesForUser()` in
 *    `app/workspace/page.tsx` lists every accessible org (slug + legal_name);
 *    "recent" ordering needs a `last_accessed_at` column that is NOT in the
 *    schema yet — until then this is a static sample. Pass only orgs the user
 *    is a member of (slice to the 3 the component shows).
 *  • logoUrl                 → no org logo in schema yet; the grey initial
 *    square stands in. When org branding lands, validate the stored URL is
 *    `https:` (the avatar renders it as a raw <img src>).
 *
 * SECURITY (at wiring): every `*Href` / `org.href` is rendered into a raw
 * `<a href>` with no sanitization. Build them as server-side internal path
 * strings from a trusted slug (`/${slug}`) — never store/forward a full URL
 * or a user-controlled scheme (React does not block `javascript:` in href).
 */
export function OrgSwitcherClient({ orgSlug }: { orgSlug: string }) {
  // MOCK — replace with real org identity (see seam note above).
  const currentOrg = {
    id: "current",
    name: "Nortinger",
    role: "Owner",
    memberCount: 1,
  }

  // MOCK — replace with the user's real recent orgs (≤3, excluding current).
  const recentOrgs = [
    { id: "acme", name: "Acme Books", href: "/acme" },
    { id: "northwind", name: "Northwind Trading", href: "/northwind" },
    { id: "globex", name: "Globex Holding", href: "/globex" },
  ]

  return (
    <OrgSwitcher
      currentOrg={currentOrg}
      recentOrgs={recentOrgs}
      settingsHref={`/${orgSlug}/settings`}
      inviteHref={`/${orgSlug}/settings/members`}
      createOrgHref="/onboarding"
      workspaceHref="/workspace"
    />
  )
}
