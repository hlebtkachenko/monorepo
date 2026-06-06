import type { ReactNode } from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { eq, and } from "drizzle-orm"
import { auth } from "@workspace/auth/server"
import { withAdminBypass } from "@workspace/db"
import { organization, organization_membership } from "@workspace/db/schema"

import { AppContextMenuClient } from "../_components/app-context-menu-client"

// Mirrors the DB CHECK constraint on organization.slug:
//   slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'
//   length(slug) BETWEEN 2 AND 63
// First character may be a letter OR a digit (DB allows both). The
// length-1 single-char form is also permitted by the regex but DB length
// CHECK rejects it; we still accept here so the redirect surface matches
// the storage rule exactly, and a wrong-length slug is treated the same
// as a non-existent org (resolveMembership returns null).
const SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/
const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "auth",
  "onboarding",
  "workspace",
  "_next",
  "favicon.ico",
])

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

  const session = await auth.api.getSession({ headers: await headers() })
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

  return (
    <AppContextMenuClient
      orgSlug={orgSlug}
      user={{ id: session.user.id, email: session.user.email }}
    >
      {children}
    </AppContextMenuClient>
  )
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
