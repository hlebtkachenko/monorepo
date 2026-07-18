"use client"

import {
  OrgSwitcher,
  type OrgSwitcherCurrentOrg,
  type OrgSwitcherOrg,
} from "@workspace/ui/blocks/app-header"

import { orgHref } from "@/lib/org/href"

/**
 * Org-switcher wrapper for the rebuilt tree — feeds the presentational
 * `OrgSwitcher` its data. All hrefs go through `orgHref`, so switching orgs
 * keeps you inside the new tree during coexistence and the temporary `/o`
 * prefix lives in one place.
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
  return (
    <OrgSwitcher
      currentOrg={currentOrg}
      recentOrgs={recentOrgs}
      settingsHref={orgHref(slug, "settings")}
      inviteHref={orgHref(slug, "settings")}
      createOrgHref="/onboarding"
      workspaceHref="/workspace"
    />
  )
}
