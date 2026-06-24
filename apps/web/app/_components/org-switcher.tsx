"use client"

import { OrgSwitcher } from "@workspace/ui/blocks/app-header"

/**
 * Org-switcher surface wrapper — feeds the presentational `OrgSwitcher`
 * (packages/ui) its data, same pattern as `OrgSidebar` / `AppRailNav`.
 *
 * ── DATA SEAM (all values below are MOCK for visual review) ──────────────
 * Wire real data here when it exists (tracked in GitHub issue #394):
 *
 *  • currentOrg.name / role  → `resolveMembership()` in
 *    `app/[orgSlug]/layout.tsx` already returns `legalName` + `role`; thread
 *    them down to the page (like `getHeaderUser()` does) and pass in.
 *  • currentOrg.memberCount  → `SELECT COUNT(*) FROM organization_membership
 *    WHERE organization_id = $1 AND active = true`.
 *  • recentOrgs              → `listWorkspacesForUser()` in
 *    `app/workspace/page.tsx` already lists every accessible org (slug +
 *    legal_name); "recent" ordering needs a `last_accessed_at` column that
 *    is NOT in the schema yet — until then this is a static sample.
 *  • logoUrl                 → no org logo in schema yet; the grey initial
 *    square stands in. Pass the real URL once org branding lands.
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
