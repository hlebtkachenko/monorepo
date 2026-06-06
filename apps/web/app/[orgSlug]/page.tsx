import { headers } from "next/headers"
import { eq } from "drizzle-orm"
import { auth } from "@workspace/auth/server"
import { withAdminBypass } from "@workspace/db"
import { app_user } from "@workspace/db/schema"
import { getBuildVersion } from "@workspace/ui/brand-assets"
import { AppHeader } from "@workspace/ui/blocks/app-header"
import { AppShell } from "@workspace/ui/blocks/app-shell"

import { presignAvatarRead } from "../_lib/avatar-storage"
import { AppRailNav } from "../_components/app-rail-nav"
import { IconPackSwitcher } from "../_components/icon-pack-switcher"
import { OrgHeaderActions } from "../_components/org-header-actions"
import { orgRailNav } from "./nav"

export const metadata = {
  title: "Dashboard",
}

/**
 * Resolve the signed-in user's display name + avatar for the header. The
 * uploaded avatar (`avatar_url`) is a private-bucket S3 key resolved to a
 * presigned GET URL; if there's none, fall back to the Better Auth `image`
 * (e.g. an OAuth provider photo). Initials are derived client-side when both
 * are absent.
 */
async function getHeaderUser(): Promise<{
  userName?: string
  userImage?: string
}> {
  const session = await auth.api.getSession({ headers: await headers() })
  const userId = session?.user?.id
  if (!userId) return {}

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
    userName: row?.display_name || row?.name || session.user.email,
    userImage: presigned ?? row?.image ?? undefined,
  }
}

export default async function OrgDashboardPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const { userName, userImage } = await getHeaderUser()
  return (
    <AppShell
      header={
        <AppHeader
          actions={
            <OrgHeaderActions
              userName={userName}
              userImage={userImage}
              orgSlug={orgSlug}
              version={getBuildVersion()}
            />
          }
        />
      }
      rail={<AppRailNav items={orgRailNav(orgSlug)} />}
      sidebar={<div className="size-full" />}
      assistant={<div className="size-full" />}
      logoHref={`/${orgSlug}`}
    >
      {/* Temporary dev-only control for visually verifying the icon-pack
          swap. Gated out of production until the real settings UI ships. */}
      {process.env.NODE_ENV !== "production" && <IconPackSwitcher />}
    </AppShell>
  )
}
