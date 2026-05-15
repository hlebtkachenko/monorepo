import type { ReactNode } from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { eq, and } from "drizzle-orm"
import { auth } from "@workspace/auth/server"
import { withAdminBypass } from "@workspace/db"
import { organization, organization_membership } from "@workspace/db/schema"

import { AccountMenu } from "../auth/_components/account-menu"

/**
 * Organization-scoped layout.
 *
 * Resolves `:orgSlug` to an `organization.id`, validates the signed-in
 * user has an active `organization_membership` for it, and renders the
 * left-nav chrome around child pages. Unauthorized callers are sent back
 * to /workspace with a flash signal.
 *
 * The resolved organization id + role are NOT bound to any tenancy GUC
 * here — that binding happens in each server action / route handler that
 * actually touches the DB, via `withOrganization(orgId, userId, ...)`.
 * Doing the bind here would leak it across renders within the same RSC
 * request (RSC renders are independent transactions).
 */
export default async function OrgLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect("/auth/login")
  }
  const membership = await resolveMembership({
    slug: orgSlug,
    userId: session.user.id,
  })
  if (!membership) {
    redirect("/workspace?error=no-access&slug=" + encodeURIComponent(orgSlug))
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-card p-4">
        <div className="mb-6">
          <p className="text-xs tracking-wide text-muted-foreground uppercase">
            Organization
          </p>
          <p className="text-sm font-medium">{membership.legalName}</p>
        </div>
        <nav className="flex-1 space-y-1 text-sm">
          <NavItem href={`/${orgSlug}`} label="Dashboard" />
          <NavItem href={`/${orgSlug}/documents`} label="Documents" />
          <NavItem href={`/${orgSlug}/transactions`} label="Transactions" />
          <NavItem href={`/${orgSlug}/accounting`} label="Accounting" />
          <NavItem href={`/${orgSlug}/finance`} label="Finance" />
          <NavItem href={`/${orgSlug}/taxes`} label="Taxes" />
          <NavItem href={`/${orgSlug}/closing`} label="Closing" />
          <NavItem href={`/${orgSlug}/personnel`} label="Personnel" />
          <NavItem href={`/${orgSlug}/assets`} label="Assets" />
          <NavItem href={`/${orgSlug}/directory`} label="Directory" />
          <NavItem href={`/${orgSlug}/reports`} label="Reports" />
          <NavItem href={`/${orgSlug}/settings`} label="Settings" />
        </nav>
        <div className="mt-4 border-t pt-4">
          <AccountMenu email={session.user.email} />
        </div>
      </aside>
      <main className="flex-1">{children}</main>
    </div>
  )
}

function NavItem({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block rounded-md px-3 py-2 text-foreground/80 hover:bg-accent hover:text-foreground"
    >
      {label}
    </Link>
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
    const [org] = await db
      .select({
        id: organization.id,
        workspace_id: organization.workspace_id,
        legal_name: organization.legal_name,
      })
      .from(organization)
      .where(eq(organization.slug, input.slug))
      .limit(1)
    if (!org) return null

    const [m] = await db
      .select({ role: organization_membership.role })
      .from(organization_membership)
      .where(
        and(
          eq(organization_membership.organization_id, org.id),
          eq(organization_membership.user_id, input.userId),
          eq(organization_membership.active, true),
        ),
      )
      .limit(1)
    if (!m) return null

    return {
      organizationId: org.id,
      workspaceId: org.workspace_id,
      legalName: org.legal_name,
      role: m.role,
    }
  })
}
