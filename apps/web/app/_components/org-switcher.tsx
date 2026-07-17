"use client"

import { usePathname } from "next/navigation"

import { OrgSwitcher } from "@workspace/ui/blocks/app-header"
import type {
  OrgSwitcherCurrentOrg,
  OrgSwitcherOrg,
} from "@workspace/ui/blocks/app-header"

import { orgSwitchPath } from "./org-switch-path"

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
 *  • Every `*Href` is an internal path built from the trusted DB slug
 *    (`/${slug}`), never a user-controlled scheme — keep it that way (a raw
 *    <a href> would not block `javascript:`). Recent-org hrefs are rewritten
 *    client-side via `orgSwitchPath` to carry the current pathname across; the
 *    slug base stays trusted and only static same-origin path segments are
 *    appended.
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
  const pathname = usePathname()
  // Preserve the user's current in-org location when switching orgs: the
  // server passes each recent org as a bare `/${slug}` root; rewrite it to the
  // same module/page/subpage under the target org (record-id leaves dropped —
  // see `orgSwitchPath`). Falls back to the passed href if it isn't a slug root.
  const recentOrgsWithPath = recentOrgs.map((org) => {
    const targetSlug = org.href.replace(/^\//, "")
    return targetSlug && !targetSlug.includes("/")
      ? { ...org, href: orgSwitchPath(pathname, targetSlug) }
      : org
  })
  return (
    <OrgSwitcher
      currentOrg={currentOrg}
      recentOrgs={recentOrgsWithPath}
      settingsHref={`/${orgSlug}/settings`}
      inviteHref={`/${orgSlug}/settings`}
      createOrgHref="/onboarding"
      workspaceHref="/workspace"
    />
  )
}
