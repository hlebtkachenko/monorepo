"use client"

import { usePathname } from "next/navigation"

import {
  OrgSwitcher,
  type OrgSwitcherCurrentOrg,
  type OrgSwitcherOrg,
} from "@workspace/ui/blocks/app-header"

import { ORG_PREFIX, orgHref } from "@/lib/org/href"
import { orgSwitchTarget } from "@/lib/org/switch-path"

/**
 * Org-switcher wrapper for the rebuilt tree — feeds the presentational
 * `OrgSwitcher` its data. All hrefs go through `orgHref`, so switching orgs
 * keeps you inside the new tree during coexistence and the temporary `/o`
 * prefix lives in one place.
 *
 * The server passes each recent org as a bare `orgHref(slug)` root; we rewrite
 * it client-side to preserve the user's current in-org sub-path across the org
 * switch (`/o/a/company/periods` → `/o/b/company/periods`). The org-scoped
 * `?period=` and any other query are dropped — see `orgSwitchTarget`. The slug
 * base stays trusted (only static same-origin path segments are appended).
 */
export function OrgSwitcherClient({
  slug,
  currentOrg,
  recentOrgs,
}: {
  slug: string
  currentOrg: OrgSwitcherCurrentOrg
  recentOrgs: OrgSwitcherOrg[]
}) {
  const pathname = usePathname()
  const prefix = `${ORG_PREFIX}/`
  const recentOrgsWithPath = recentOrgs.map((org) => {
    // Server hrefs are `orgHref(slug)` = `/o/<slug>`; derive the target slug and
    // only rewrite bare roots, falling back to the passed href otherwise.
    const targetSlug = org.href.startsWith(prefix)
      ? org.href.slice(prefix.length)
      : ""
    return targetSlug && !targetSlug.includes("/")
      ? { ...org, href: orgSwitchTarget(pathname, slug, targetSlug) }
      : org
  })
  return (
    <OrgSwitcher
      currentOrg={currentOrg}
      recentOrgs={recentOrgsWithPath}
      settingsHref={orgHref(slug, "settings")}
      inviteHref={orgHref(slug, "settings")}
      createOrgHref="/onboarding"
      workspaceHref="/workspace"
    />
  )
}
