import type { ReactNode } from "react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { eq, and } from "drizzle-orm"
import { withAdminBypass } from "@workspace/db"
import {
  app_user,
  organization,
  organization_membership,
} from "@workspace/db/schema"
import { RESERVED_SLUGS } from "@workspace/org-provisioning"
import { getBuildIdentity, getBuildVersion } from "@workspace/ui/brand-assets"
import { AppHeader } from "@workspace/ui/blocks/app-header"

import { AppContextMenuClient } from "../_components/app-context-menu-client"
import { OrgHeaderActions } from "../_components/org-header-actions"
import { OrgSwitcherClient } from "../_components/org-switcher"
import { PeriodSwitcherClient } from "../_components/period-switcher"
import { OrgShell } from "../_components/org-shell"
import { presignAvatarRead } from "../_lib/avatar-storage"
import { getHeaderOrgData } from "./_lib/header-org"
import {
  getHeaderPeriods,
  PERIOD_COOKIE,
  resolveActivePeriodId,
} from "./_lib/header-periods"
import { getRequestSession } from "./_lib/request-session"

// DB role enum → human-readable label rendered verbatim in the org switcher.
const ROLE_LABELS: Record<ResolvedMembership["role"], string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  agent: "Agent",
  guest: "Guest",
}

// Mirrors the DB CHECK constraint on organization.slug:
//   slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'
//   length(slug) BETWEEN 2 AND 63
// First character may be a letter OR a digit (DB allows both). The
// length-1 single-char form is also permitted by the regex but DB length
// CHECK rejects it; we still accept here so the redirect surface matches
// the storage rule exactly, and a wrong-length slug is treated the same
// as a non-existent org (resolveMembership returns null).
const SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/
// RESERVED_SLUGS is the shared org-provisioning policy (single source of truth) —
// the same set pickUniqueSlug skips at creation time.

/**
 * Organization-scoped layout.
 *
 * Resolves `:orgSlug` to an `organization.id`, validates the signed-in
 * user has an active `organization_membership` for it, and renders
 * children. Unauthorized callers are sent back to /workspace with a
 * flash signal. The visual shell is intentionally blank — chrome lands
 * once the design is approved.
 *
 * The resolved organization id + role are NOT bound to any tenancy GUC
 * here — that binding happens in each server action / route handler
 * that actually touches the DB, via `withOrganization(orgId, userId,
 * ...)`. Doing the bind here would leak it across renders within the
 * same RSC request (RSC renders are independent transactions).
 */
export default async function OrgLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  // Pre-DB guards: bot scans for /admin, /wp-admin etc. should not hit
  // Postgres at all. Slug regex matches the (workspace_id, slug) DB
  // CHECK constraint so any value that could not legitimately be a slug
  // is short-circuited.
  if (!SLUG_RE.test(orgSlug) || RESERVED_SLUGS.has(orgSlug)) {
    redirect("/workspace?error=invalid-slug")
  }

  const session = await getRequestSession()
  if (!session) {
    // Pass the requested path forward so login can bounce back here.
    redirect("/auth/login?next=" + encodeURIComponent("/" + orgSlug))
  }
  let membership: ResolvedMembership | null
  try {
    membership = await resolveMembership({
      slug: orgSlug,
      userId: session.user.id,
    })
  } catch (err) {
    // Fail closed on transient DB errors so a 5xx during a partial
    // outage cannot leak the layout shell to an unauthenticated viewer.
    console.error("[orgSlug/layout] resolveMembership threw", err)
    redirect("/workspace?error=internal")
  }
  if (!membership) {
    // Don't echo the unsanitized slug back into the query string — the
    // workspace page now only knows that access was denied.
    redirect("/workspace?error=no-access")
  }

  // Chrome data for the persistent shell header — fetched server-side (needs
  // the session + a private-bucket avatar presign) and passed into the client
  // shell as a node. The header user + org-switcher data are independent reads,
  // so they run concurrently.
  const [{ userName, userImage }, orgData, periods] = await Promise.all([
    getHeaderUser(session.user.id, session.user.email),
    getHeaderOrgData({
      organizationId: membership.organizationId,
      userId: session.user.id,
    }),
    getHeaderPeriods({ organizationId: membership.organizationId }),
  ])
  const cookieStore = await cookies()
  const activePeriodId = resolveActivePeriodId(
    periods,
    cookieStore.get(PERIOD_COOKIE)?.value,
  )
  const header = (
    <AppHeader
      leftContent={
        <>
          <OrgSwitcherClient
            orgSlug={orgSlug}
            currentOrg={{
              id: membership.organizationId,
              name: membership.legalName,
              role: ROLE_LABELS[membership.role],
              memberCount: orgData.memberCount,
            }}
            recentOrgs={orgData.otherOrgs.map((o) => ({
              id: o.id,
              name: o.name,
              href: `/${o.slug}`,
            }))}
          />
          <PeriodSwitcherClient
            key={membership.organizationId}
            orgSlug={orgSlug}
            periods={periods}
            activePeriodId={activePeriodId ?? ""}
          />
        </>
      }
      actions={
        <OrgHeaderActions
          userName={userName}
          userImage={userImage}
          orgSlug={orgSlug}
          version={getBuildVersion()}
        />
      }
    />
  )

  return (
    <AppContextMenuClient
      orgSlug={orgSlug}
      user={{ id: session.user.id, email: session.user.email }}
    >
      <OrgShell
        orgSlug={orgSlug}
        header={header}
        deployment={getBuildIdentity()}
      >
        {children}
      </OrgShell>
    </AppContextMenuClient>
  )
}

/**
 * Resolve the signed-in user's display name + avatar for the header. The
 * uploaded avatar (`avatar_url`) is a private-bucket S3 key resolved to a
 * presigned GET URL; falls back to the Better Auth `image`. Initials are derived
 * client-side when both are absent.
 */
async function getHeaderUser(
  userId: string,
  email: string,
): Promise<{ userName?: string; userImage?: string }> {
  const row = await withAdminBypass(async (db) => {
    const [r] = await db
      .select({
        name: app_user.name,
        display_name: app_user.display_name,
        image: app_user.image,
        avatar_url: app_user.avatar_url,
      })
      .from(app_user)
      .where(eq(app_user.id, userId))
      .limit(1)
    return r ?? null
  })
  const presigned = await presignAvatarRead(row?.avatar_url ?? null)
  return {
    userName: row?.display_name || row?.name || email,
    userImage: presigned ?? row?.image ?? undefined,
  }
}

interface ResolvedMembership {
  organizationId: string
  workspaceId: string
  legalName: string
  role: "owner" | "admin" | "member" | "agent" | "guest"
}

async function resolveMembership(input: {
  slug: string
  userId: string
}): Promise<ResolvedMembership | null> {
  return await withAdminBypass(async (db) => {
    // organization.slug is UNIQUE per (workspace_id, slug) — the same
    // slug can repeat across workspaces. Joining membership in the same
    // query keys the lookup on (slug, user_id, active) so the only org
    // we can resolve is by definition one the user belongs to. Without
    // this join the first matching slug row wins (non-deterministic
    // across workspaces).
    const [row] = await db
      .select({
        organization_id: organization.id,
        workspace_id: organization.workspace_id,
        legal_name: organization.legal_name,
        role: organization_membership.role,
      })
      .from(organization)
      .innerJoin(
        organization_membership,
        and(
          eq(organization_membership.organization_id, organization.id),
          eq(organization_membership.user_id, input.userId),
          eq(organization_membership.active, true),
        ),
      )
      .where(eq(organization.slug, input.slug))
      .limit(1)
    if (!row) return null

    return {
      organizationId: row.organization_id,
      workspaceId: row.workspace_id,
      legalName: row.legal_name,
      role: row.role,
    }
  })
}
