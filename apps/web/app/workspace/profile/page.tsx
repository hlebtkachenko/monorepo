import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@workspace/auth/server"

import { ProfileForm } from "../../_components/workspace/profile/profile-form"
import { getWorkspaceHeaderUser } from "../_lib/workspace-context"

export const metadata = { title: "Your profile" }

/**
 * Your profile — the signed-in user's account. Identity is display-real (name +
 * presigned avatar, resolved server-side) with a stub Save; the two-factor
 * section reads the live `twoFactorEnabled` flag and links to the real MFA
 * setup flow (see `ProfileForm`).
 */
export default async function ProfilePage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/auth/login")

  const { userName, userImage } = await getWorkspaceHeaderUser(
    session.user.id,
    session.user.email,
  )

  const profile = {
    displayName: userName ?? session.user.name,
    email: session.user.email,
    image: userImage,
    twoFactorEnabled: Boolean(session.user.twoFactorEnabled),
  }

  // Keyed on the resolved values — see the identical comment in
  // workspace/settings/page.tsx: only `displayName` is server-normalized
  // (`.trim()`), but keying the whole object is the same one-line fix and
  // keeps this page consistent with its siblings.
  return <ProfileForm key={JSON.stringify(profile)} profile={profile} />
}
