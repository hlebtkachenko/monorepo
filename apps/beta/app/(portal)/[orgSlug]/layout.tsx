import type { ReactNode } from "react"

import { assistantVisibleTo } from "@/lib/data/assistant"
import { activeMembershipsForViewer } from "@/lib/data/memberships"
import { organizationForScope } from "@/lib/data/organizations"

import { AccountMenu } from "../../_components/account-menu"
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

  const [org, { memberships, viewer, isStaff }] = await Promise.all([
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
      accountMenu={
        <AccountMenu
          orgSlug={scope.organizationSlug}
          name={viewer.name}
          email={viewer.email}
          // `is_staff` decides here, on the server, and only a boolean crosses:
          // an /admin entry rendered for someone `requireOffice()` will 404 is a
          // dead link.
          staffLink={isStaff}
        />
      }
      isOwner={scope.role === "owner"}
      // Resolved HERE because both halves of the answer — the
      // `BETA_ASSISTANT_ENABLED` flag and the §5 role rule — are server facts,
      // and `BetaShell` is a Client Component. It gates the rail ENTRY only;
      // `assertAssistantAvailable` answers 404 on the routes themselves.
      showAssistant={assistantVisibleTo(scope)}
      isManagement={scope.role !== "guest"}
    >
      {children}
    </BetaShell>
  )
}
