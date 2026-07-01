"use client"

import { OrgSwitcher } from "@workspace/ui/blocks/app-header"
import type {
  OrgSwitcherCurrentOrg,
  OrgSwitcherOrg,
} from "@workspace/ui/blocks/app-header"

/**
 * Org-switcher surface wrapper — feeds the presentational `OrgSwitcher`
 * (packages/ui) its data, same pattern as `OrgSidebar` / `AppRailNav`. All
 * values are real, resolved server-side in `app/[orgSlug]/layout.tsx` via
 * `resolveMembership` + `getHeaderOrgData` and passed in as plain props.
 *
 * Notes for future work:
 *  • `recentOrgs` is ordered by name, not recency — there is no
 *    `last_accessed_at` column yet, so the "Recent organisations" label is
 *    approximate. Add the column + ORDER BY to make it true recency.
 *  • `logoUrl` is absent (no org-logo column); the grey initial square stands
 *    in. When org branding lands, validate the stored URL is `https:` before
 *    passing it (the avatar renders it as a raw <img src>).
 *  • Every `*Href` is an internal path built server-side from the trusted DB
 *    slug (`/${slug}`), never a user-controlled scheme — keep it that way (a
 *    raw <a href> would not block `javascript:`).
 */
export function OrgSwitcherClient({
  orgSlug,
  currentOrg,
  recentOrgs,
}: {
  orgSlug: string
  currentOrg: OrgSwitcherCurrentOrg
  recentOrgs: OrgSwitcherOrg[]
}) {
  return (
    <OrgSwitcher
      currentOrg={currentOrg}
      recentOrgs={recentOrgs}
      settingsHref={`/${orgSlug}/settings`}
      inviteHref={`/${orgSlug}/settings`}
      createOrgHref="/onboarding"
      workspaceHref="/workspace"
    />
  )
}
