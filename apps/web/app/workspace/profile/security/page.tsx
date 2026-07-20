import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { and, desc, eq, gt, sql } from "drizzle-orm"
import { auth } from "@workspace/auth/server"
import { withAdminBypass } from "@workspace/db"
import {
  api_key,
  auth_session,
  oauth_client,
  oauth_consent,
  organization,
} from "@workspace/db/schema"

import { ProfileSecurity } from "@/app/_components/workspace/profile/profile-security"

import { getDangerAvailabilityAction } from "../danger-actions"

export const metadata = { title: "Profile security" }

export default async function ProfileSecurityPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/auth/login")

  const [{ sessions, apiKeys, connectedApps }, danger] = await Promise.all([
    withAdminBypass(async (db) => {
      const [sessions, apiKeys, connectedApps] = await Promise.all([
        db
          .select({
            id: auth_session.id,
            device: auth_session.user_agent,
            ip: auth_session.ip_address,
            updatedAt: auth_session.updated_at,
          })
          .from(auth_session)
          .where(
            and(
              eq(auth_session.user_id, session.user.id),
              gt(auth_session.expires_at, new Date()),
            ),
          )
          .orderBy(desc(auth_session.updated_at)),
        db
          .select({
            id: api_key.id,
            name: api_key.name,
            organization: organization.legal_name,
            prefix: api_key.prefix,
            scopes: api_key.scopes,
            lastUsedAt: api_key.last_used_at,
            revokedAt: api_key.revoked_at,
          })
          .from(api_key)
          .innerJoin(organization, eq(organization.id, api_key.organization_id))
          .where(eq(api_key.created_by_user_id, session.user.id))
          .orderBy(desc(api_key.created_at)),
        db
          .select({
            id: oauth_consent.id,
            name: oauth_client.name,
            organization: organization.legal_name,
            scopes: oauth_consent.scopes,
            createdAt: oauth_consent.createdAt,
          })
          .from(oauth_consent)
          .leftJoin(
            oauth_client,
            eq(oauth_client.clientId, oauth_consent.clientId),
          )
          // reference_id is text; organization.id is uuid — compare as text so a
          // null / non-matching binding just yields a null organization.
          .leftJoin(
            organization,
            eq(sql`${organization.id}::text`, oauth_consent.referenceId),
          )
          .where(eq(oauth_consent.userId, session.user.id))
          .orderBy(desc(oauth_consent.createdAt)),
      ])
      return { sessions, apiKeys, connectedApps }
    }),
    getDangerAvailabilityAction(),
  ])

  return (
    <ProfileSecurity
      twoFactorEnabled={Boolean(session.user.twoFactorEnabled)}
      sessions={sessions.map((item) => ({
        id: item.id,
        device: item.device ?? "Unknown device",
        ip: item.ip ?? "Unknown",
        lastActive: item.updatedAt.toLocaleString(),
        current: item.id === session.session.id,
      }))}
      apiKeys={apiKeys.map((key) => ({
        id: key.id,
        name: key.name,
        organization: key.organization,
        prefix: key.prefix,
        scopes: key.scopes,
        lastUsed: key.lastUsedAt?.toLocaleString() ?? "Never",
        revoked: key.revokedAt !== null,
      }))}
      connectedApps={connectedApps.map((app) => ({
        id: app.id,
        name: app.name ?? "Unknown application",
        organization: app.organization ?? "—",
        scopes: app.scopes,
        authorizedAt: app.createdAt.toLocaleString(),
      }))}
      danger={{
        workspaceName: danger.workspaceName,
        leaveBlockedByOwnership: danger.leaveBlockedByOwnership,
        deleteBlockedWorkspace: danger.deleteBlockedWorkspace,
      }}
    />
  )
}
