import { cache, type ReactNode } from "react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { getTranslations } from "@workspace/i18n/server"
import { getBuildIdentity, getBuildVersion } from "@workspace/ui/brand-assets"
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

import { OrgShell } from "./_shell/org-shell"
import { OrgHeaderActions } from "./_shell/app-header/header-actions"
import { OrgSwitcherClient } from "./_shell/app-header/org-switcher"
import { PeriodSwitcherClient } from "./_shell/app-header/period-switcher"
import { hasDebugModuleAccess } from "./debug/access"

/**
 * Per-request memoized membership resolution.
 *
 * `resolveMembership` isn't `cache()`-wrapped itself, and both `generateMetadata`
 * and the layout render need the same lookup in one request pass. Wrapping it
 * here — keyed on the primitive slug + user id, not a fresh object literal —
 * collapses the two co-rendering reads into a single DB roundtrip, the same
 * reasoning `getRequestSession` documents for the session read.
 */
const resolveLayoutMembership = cache((slug: string, userId: string) =>
  resolveMembership({ slug, userId }),
)

/**
 * The org's legal name is the layout's default document title, so the browser
 * tab shows the org (composed by the root `%s · {brand}` template) instead of
 * always the bare brand. Page-level titles still override. The org name is
 * proper-noun data, not a translatable string.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}): Promise<Metadata> {
  const { orgSlug } = await params
  if (!isResolvableOrgSlug(orgSlug)) return {}

  const session = await getRequestSession()
  if (!session) return {}

  try {
    const membership = await resolveLayoutMembership(orgSlug, session.user.id)
    if (!membership) return {}
    // Plain string, not a `title.template`: the root layout's `%s · {brand}`
    // template composes it, and it becomes the default title for org pages that
    // don't set their own (page-level `org.titles.*` still override).
    return { title: membership.legalName }
  } catch {
    // A transient resolution error just means no org-specific title; the layout
    // render below performs the fail-closed redirect.
    return {}
  }
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
    membership = await resolveLayoutMembership(orgSlug, session.user.id)
  } catch (err) {
    // Fail closed on transient DB errors so a partial outage can't leak the
    // shell to an unauthorized viewer.
    console.error("[o/orgSlug/layout] resolveMembership threw", err)
    redirect("/workspace?error=internal")
  }
  if (!membership) {
    redirect("/workspace?error=no-access")
  }

  // Fail closed on a transient DB error in the header reads: redirect safely
  // instead of bubbling to a nonexistent boundary (mirrors the membership guard).
  let headerData: [
    Awaited<ReturnType<typeof getHeaderUser>>,
    Awaited<ReturnType<typeof getHeaderOrgData>>,
    Awaited<ReturnType<typeof getActivePeriod>>,
    boolean,
  ]
  try {
    headerData = await Promise.all([
      getHeaderUser(session.user.id, session.user.email),
      getHeaderOrgData({
        organizationId: membership.organizationId,
        userId: session.user.id,
      }),
      // The layout can't read `searchParams`, so it resolves the cookie/default
      // active period for the switcher's initial value; the client switcher then
      // overrides from the live `?period=` URL.
      getActivePeriod(membership.organizationId, session.user.id),
      // Debug rail visibility: allowlisted operators see the Debug module link on
      // staging/prod (the page gate independently re-checks). Batched here so it
      // doesn't serialize behind the header reads.
      hasDebugModuleAccess(membership.workspaceId),
    ])
  } catch (err) {
    console.error("[o/orgSlug/layout] header reads threw", err)
    redirect("/workspace?error=internal")
  }
  const [{ userName, userImage }, orgData, period, debugAccess] = headerData

  // DB role enum → localized label rendered verbatim in the org switcher.
  const tRoles = await getTranslations("org.roles")

  const header = (
    <AppHeader
      search={false}
      leftContent={
        <>
          <OrgSwitcherClient
            slug={orgSlug}
            currentOrg={{
              id: membership.organizationId,
              name: membership.legalName,
              role: tRoles(membership.role),
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
      actions={
        <OrgHeaderActions
          userName={userName}
          userImage={userImage}
          slug={orgSlug}
          version={getBuildVersion()}
        />
      }
    />
  )

  return (
    <OrgShell
      slug={orgSlug}
      header={header}
      deployment={getBuildIdentity()}
      debugAccess={debugAccess}
    >
      {children}
    </OrgShell>
  )
}
