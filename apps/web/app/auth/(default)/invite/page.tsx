import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@workspace/auth/server"
import { getTranslations } from "@workspace/i18n/server"
import type { InviteRecord } from "@workspace/auth/tokens"

import { isDevPreview } from "@/lib/dev-preview"

import { readInviteClaims } from "../../../onboarding/_lib/invite-cookie"
import { InviteWelcomeActions } from "./invite-welcome-actions"

export async function generateMetadata() {
  const t = await getTranslations("auth.invite")
  return { title: t("metaTitle") }
}

export default async function InviteWelcomePage() {
  let claims = await readInviteClaims()
  // Dev-preview renders the invite card for design inspection even
  // without a real invite token.
  if (!claims && (await isDevPreview())) {
    claims = {
      id: "preview",
      email: "preview@example.com",
      organizationId: "preview",
      workspaceId: "preview",
      role: "member",
      status: "pending",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    } satisfies InviteRecord
  }
  if (!claims) {
    redirect("/auth/login?error=missing-invite-token")
  }

  const session = await auth.api.getSession({ headers: await headers() })
  const sessionEmail = session?.user.email?.toLowerCase() ?? null
  const inviteEmail = claims.email.toLowerCase()
  const isSignedIn = !!sessionEmail
  const matchesSession = sessionEmail === inviteEmail

  return (
    <InviteWelcomeActions
      email={claims.email}
      role={claims.role}
      isSignedIn={isSignedIn}
      matchesSession={matchesSession}
      sessionEmail={session?.user.email ?? null}
    />
  )
}
