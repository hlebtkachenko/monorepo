import type { ReactNode } from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { getBuildIdentity } from "@workspace/ui/brand-assets"
import { AppHeader } from "@workspace/ui/blocks/app-header"

import { safeNext } from "@/lib/safe-next"
import { orgBasePath, orgHref } from "@/lib/org/href"
import { getHeaderOrgData, getHeaderUser } from "@/lib/org/header"
import { getActivePeriod } from "@/lib/org/period"
import {
  isResolvableOrgSlug,
  resolveMembership,
  type ResolvedMembership,
} from "@/lib/org/resolve"
import { getRequestSession } from "@/lib/org/session"

import { HeaderUser } from "./_shell/header-user"
import { OrgShell } from "./_shell/org-shell"
import { OrgSwitcherClient } from "./_shell/org-switcher"
import { PeriodSwitcherClient } from "./_shell/period-switcher"

// DB role enum → human-readable label rendered verbatim in the org switcher.
const ROLE_LABELS: Record<ResolvedMembership["role"], string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  agent: "Agent",
  guest: "Guest",
}

/**
 * Layout for the rebuilt org tree (`/o/[orgSlug]`).
 *
 * Resolves `:orgSlug` → an `organization.id` + membership, redirects
 * unauthorized callers, fetches the app-shell header data, and mounts the new
 * shell. Everything it needs comes from `apps/web/lib/org/*` and `@workspace/*`
 * — never from the frozen old tree (enforced by the org-tree ESLint rule).
 *
 * The org GUC is NOT bound here (RSC renders are independent transactions);
 * each server action / route handler binds its own tenancy via `withOrganization`.
 */
export default async function OrgLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  if (!isResolvableOrgSlug(orgSlug)) {
    redirect("/workspace?error=invalid-slug")
  }

  const session = await getRequestSession()
  if (!session) {
    // Bounce login back to the exact deep link (the proxy forwards it as
    // `x-pathname`), falling back to the org home.
    const requested = (await headers()).get("x-pathname")
    const next = safeNext(requested, orgBasePath(orgSlug))
    redirect("/auth/login?next=" + encodeURIComponent(next))
  }

  let membership: ResolvedMembership | null
  try {
    membership = await resolveMembership({
      slug: orgSlug,
      userId: session.user.id,
    })
  } catch (err) {
    // Fail closed on transient DB errors so a partial outage can't leak the
    // shell to an unauthorized viewer.
    console.error("[o/orgSlug/layout] resolveMembership threw", err)
    redirect("/workspace?error=internal")
  }
  if (!membership) {
    redirect("/workspace?error=no-access")
  }

  const [{ userName, userImage }, orgData, period] = await Promise.all([
    getHeaderUser(session.user.id, session.user.email),
    getHeaderOrgData({
      organizationId: membership.organizationId,
      userId: session.user.id,
    }),
    // The layout can't read `searchParams`, so it resolves the cookie/default
    // active period for the switcher's initial value; the client switcher then
    // overrides from the live `?period=` URL.
    getActivePeriod(membership.organizationId),
  ])

  const header = (
    <AppHeader
      leftContent={
        <>
          <OrgSwitcherClient
            slug={orgSlug}
            currentOrg={{
              id: membership.organizationId,
              name: membership.legalName,
              role: ROLE_LABELS[membership.role],
              memberCount: orgData.memberCount,
            }}
            recentOrgs={orgData.otherOrgs.map((o) => ({
              id: o.id,
              name: o.name,
              href: orgHref(o.slug),
            }))}
          />
          <PeriodSwitcherClient
            key={membership.organizationId}
            slug={orgSlug}
            periods={period.periods}
            defaultPeriodId={period.active?.id ?? ""}
          />
        </>
      }
      actions={<HeaderUser userName={userName} userImage={userImage} />}
    />
  )

  return (
    <OrgShell slug={orgSlug} header={header} deployment={getBuildIdentity()}>
      {children}
    </OrgShell>
  )
}
