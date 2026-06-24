import { eq } from "drizzle-orm"
import { withAdminBypass } from "@workspace/db"
import { app_user } from "@workspace/db/schema"
import { getBuildVersion } from "@workspace/ui/brand-assets"
import { AppHeader } from "@workspace/ui/blocks/app-header"
import { AppShell, AssistantScaffold } from "@workspace/ui/blocks/app-shell"

import { presignAvatarRead } from "../_lib/avatar-storage"
import { getRequestSession } from "./_lib/request-session"
import { AppBottomNav } from "../_components/app-bottom-nav"
import { AppRailNav } from "../_components/app-rail-nav"
import { ContentDemoBody } from "../_components/content-demo/content-demo-body"
import { ContentDemoHeader } from "../_components/content-demo/content-demo-header"
import { OrgContentProvider } from "../_components/content-demo/context"
import { OrgHeaderActions } from "../_components/org-header-actions"
import { OrgSidebar } from "../_components/org-sidebar"
import { SidebarModuleTitle } from "../_components/sidebar-module-title"
import { orgBottomNav, orgRailNav } from "./nav"

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
  const session = await getRequestSession()
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
  // Build the rail nav once — the rail renders it and the sidebar module title
  // derives the active module from the same list, so they can't drift.
  const railNav = orgRailNav(orgSlug)
  return (
    // OrgContentProvider wraps the shell so the content header (tabs, page
    // actions) and the body (toolbar + table) share state across the two
    // app-shell slots. TEMP: the Content Panel demo lives in `_components/
    // content-demo` — replace with real, route-driven content later.
    <OrgContentProvider>
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
        rail={<AppRailNav items={railNav} />}
        bottomNav={<AppBottomNav items={orgBottomNav(orgSlug)} />}
        sidebar={<OrgSidebar orgSlug={orgSlug} />}
        sidebarHeader={<SidebarModuleTitle items={railNav} />}
        contentHeader={<ContentDemoHeader />}
        assistant={<AssistantScaffold />}
        defaultAssistantOpen
        logoHref={`/${orgSlug}`}
      >
        <ContentDemoBody />
      </AppShell>
    </OrgContentProvider>
  )
}
