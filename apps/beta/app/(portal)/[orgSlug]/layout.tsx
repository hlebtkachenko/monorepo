import type { ReactNode } from "react"

import { activeMembershipsForViewer } from "@/lib/data/memberships"
import { organizationForScope } from "@/lib/data/organizations"

import { OrgSwitcher } from "../../_components/org-switcher"
import { BetaShell } from "../../_shell/beta-shell"

import { resolveOrgScope } from "./_lib/org-scope"

/**
 * Layout for every organization page (`/[orgSlug]/...`).
 *
 * Resolves `requireScope(orgSlug)` ONCE per request (via the `cache()`-
 * wrapped `resolveOrgScope`, shared with `page.tsx` and every future org page
 * in this tree) and mounts the org-scoped `BetaShell` around the page body.
 * `requireScope` itself answers 404 for every refusal case — no membership,
 * an inactive one, an archived organization, a malformed or unknown slug — so
 * there is nothing left for this layout to branch on; reaching this point
 * already proves the viewer holds a live membership here.
 */
export default async function OrgLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const scope = await resolveOrgScope(orgSlug)

  const [org, { memberships }] = await Promise.all([
    organizationForScope(scope),
    activeMembershipsForViewer(),
  ])

  // The switcher (spec §2.0) only ever shows when there is something to
  // switch TO — a single-org viewer sees no dropdown at all.
  const others = memberships.filter((m) => m.slug !== scope.organizationSlug)
  const switcher =
    memberships.length > 1 ? (
      <OrgSwitcher
        current={{ slug: org.slug, legalName: org.legalName }}
        others={others.map((m) => ({ slug: m.slug, legalName: m.legalName }))}
      />
    ) : undefined

  return (
    <BetaShell
      orgSlug={scope.organizationSlug}
      orgLegalName={org.legalName}
      switcher={switcher}
      isOwner={scope.role === "owner"}
    >
      {children}
    </BetaShell>
  )
}
