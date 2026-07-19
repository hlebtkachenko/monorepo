"use client"

import type { ReactNode } from "react"

import type { DeploymentIdentity } from "@workspace/ui/lib/deployment-version"

import { OrgShell } from "../../_components/org-shell"
import { MODULE_NAV, orgBottomNav, orgRailNav } from "../_nav/org-nav"

/**
 * Binds the cross-tier `OrgShell` to THIS tree's own nav content
 * (`_nav/org-nav`). Keeps `OrgShell` nav-agnostic + shared; this wrapper (and
 * the nav it imports) is deleted with the old tree at the org-rebuild flip.
 * Client component so the `MODULE_NAV` builder functions never cross the
 * server→client boundary.
 */
export function OrgNavShell({
  orgSlug,
  header,
  deployment,
  children,
}: {
  orgSlug: string
  header: ReactNode
  deployment: DeploymentIdentity
  children: ReactNode
}) {
  return (
    <OrgShell
      orgSlug={orgSlug}
      header={header}
      deployment={deployment}
      railNav={orgRailNav(orgSlug)}
      bottomNav={orgBottomNav(orgSlug)}
      moduleNav={MODULE_NAV}
    >
      {children}
    </OrgShell>
  )
}
