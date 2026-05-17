import { headers } from "next/headers"
import { eq } from "drizzle-orm"
import { auth } from "@workspace/auth/server"
import { withAdminBypass } from "@workspace/db"
import { app_user } from "@workspace/db/schema"
import { getTranslations } from "@workspace/i18n/server"

import { presignAvatarRead } from "../../_lib/avatar-storage"
import { readOnboardingState } from "../_lib/state-cookie"
import { ProfileForm } from "./profile-form"

export async function generateMetadata() {
  const t = await getTranslations("onboarding.profile")
  return { title: t("metaTitle") }
}

export default async function ProfilePage() {
  const state = await readOnboardingState()

  // If the user already has an account (resuming onboarding), surface any
  // avatar they uploaded. avatar_url stores an S3 key for the private
  // bucket, so it must be resolved to a presigned GET URL before render.
  let initialAvatarUrl: string | null = null
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user?.id) {
    const userId = session.user.id
    const storedKey = await withAdminBypass(async (db) => {
      const [row] = await db
        .select({ avatar_url: app_user.avatar_url })
        .from(app_user)
        .where(eq(app_user.id, userId))
        .limit(1)
      return row?.avatar_url ?? null
    })
    initialAvatarUrl = await presignAvatarRead(storedKey)
  }

  return (
    <ProfileForm initial={state.profile} initialAvatarUrl={initialAvatarUrl} />
  )
}
