import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { and, desc, eq, like } from "drizzle-orm"
import { auth } from "@workspace/auth/server"
import { withAdminBypass } from "@workspace/db"
import {
  app_user,
  audit_event,
  workspace_membership,
} from "@workspace/db/schema"

import { ProfileForm } from "../../_components/workspace/profile/profile-form"
import {
  getWorkspaceContext,
  getWorkspaceHeaderUser,
} from "../_lib/workspace-context"

export const metadata = { title: "Your profile" }

const ACTION_LABELS: Record<string, string> = {
  "profile.updated": "General information updated",
  "profile.preferences_updated": "Preferences updated",
  "profile.appearance_updated": "Appearance updated",
  "profile.privacy_updated": "Privacy choices updated",
  "profile.signature_updated": "Signature updated",
  "profile.signature_removed": "Signature removed",
  "profile.api_key_revoked": "API key revoked",
  "profile.avatar_updated": "Avatar updated",
  "profile.avatar_removed": "Avatar removed",
  "profile.email_change_requested": "Email change requested",
  "profile.email_change_failed": "Email change request failed",
  "profile.workspace_left": "Workspace left",
  "profile.account_deleted": "Account deleted",
}

function readSignaturePaths(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const value: unknown = JSON.parse(raw)
    return Array.isArray(value) &&
      value.every((path) => typeof path === "string")
      ? value
      : []
  } catch {
    return []
  }
}

function uniqueProfileOptions(values: (string | null)[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort((left, right) => left.localeCompare(right))
}

/**
 * Your profile — the signed-in user's account. Details resolve server-side and
 * write through the grouped Details form.
 */
export default async function ProfilePage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/auth/login")
  const workspaceContext = await getWorkspaceContext(session.user.id)

  const [{ user, events, structureRows }, headerUser] = await Promise.all([
    withAdminBypass(async (db) => {
      const [[user], events, structureRows] = await Promise.all([
        db
          .select({
            displayName: app_user.display_name,
            name: app_user.name,
            titlePrefix: app_user.title_prefix,
            givenName: app_user.given_name,
            familyName: app_user.family_name,
            titleSuffix: app_user.title_suffix,
            phone: app_user.phone,
            jobTitle: app_user.job_title,
            department: app_user.department,
            experience: app_user.experience,
            signatureData: app_user.signature_data,
          })
          .from(app_user)
          .where(eq(app_user.id, session.user.id))
          .limit(1),
        db
          .select({
            id: audit_event.id,
            action: audit_event.action,
            createdAt: audit_event.created_at,
          })
          .from(audit_event)
          .where(
            and(
              eq(audit_event.actor_user_id, session.user.id),
              like(audit_event.action, "profile.%"),
            ),
          )
          .orderBy(desc(audit_event.created_at))
          .limit(100),
        workspaceContext.activeWorkspaceId
          ? db
              .select({
                jobTitle: app_user.job_title,
                department: app_user.department,
              })
              .from(workspace_membership)
              .innerJoin(
                app_user,
                eq(app_user.id, workspace_membership.user_id),
              )
              .where(
                and(
                  eq(
                    workspace_membership.workspace_id,
                    workspaceContext.activeWorkspaceId,
                  ),
                  eq(workspace_membership.active, true),
                ),
              )
          : Promise.resolve([]),
      ])
      return { user, events, structureRows }
    }),
    getWorkspaceHeaderUser(session.user.id, session.user.email),
  ])

  const profile = {
    displayName: user?.displayName ?? user?.name ?? session.user.name,
    email: session.user.email,
    image: headerUser.userImage,
    titlePrefix: user?.titlePrefix ?? "",
    givenName: user?.givenName ?? user?.name.split(" ")[0] ?? "",
    familyName:
      user?.familyName ?? user?.name.split(" ").slice(1).join(" ") ?? "",
    titleSuffix: user?.titleSuffix ?? "",
    phone: user?.phone ?? "",
    jobTitle: user?.jobTitle ?? "",
    department: user?.department ?? "",
    jobTitleOptions: uniqueProfileOptions(
      structureRows.map((row) => row.jobTitle),
    ),
    departmentOptions: uniqueProfileOptions(
      structureRows.map((row) => row.department),
    ),
    experience: user?.experience ?? null,
    signatureSet: Boolean(user?.signatureData),
    signaturePaths: readSignaturePaths(user?.signatureData),
    history: events.map((event) => ({
      id: event.id,
      action: ACTION_LABELS[event.action] ?? event.action,
      at: event.createdAt.toLocaleString(),
    })),
  }

  // A successful save refreshes this RSC. Keying by the resolved values remounts
  // the editor with the newly persisted snapshot.
  return <ProfileForm key={JSON.stringify(profile)} profile={profile} />
}
