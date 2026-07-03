import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { auth } from "@workspace/auth/server"
import { withAdminBypass } from "@workspace/db"
import { workspace } from "@workspace/db/schema"

import { SettingsForm } from "../../_components/workspace/settings/settings-form"
import { getWorkspaceContext } from "../_lib/workspace-context"

export const metadata = { title: "Workspace settings" }

/**
 * Workspace (firm) settings — real values read from the active workspace's
 * `workspace` row. Save writes back via `saveWorkspaceSettingsAction` (see
 * `SettingsForm`). Read via `withAdminBypass` + explicit id predicate,
 * consistent with the tier.
 */
export default async function WorkspaceSettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/auth/login")

  const ctx = await getWorkspaceContext(session.user.id)
  if (!ctx.activeWorkspaceId) redirect("/workspace")

  const activeWorkspaceId = ctx.activeWorkspaceId
  const row = await withAdminBypass(async (db) => {
    const [r] = await db
      .select({
        displayName: workspace.display_name,
        purpose: workspace.purpose,
        contactEmail: workspace.contact_email,
        contactPhone: workspace.contact_phone,
        website: workspace.website,
      })
      .from(workspace)
      .where(eq(workspace.id, activeWorkspaceId))
      .limit(1)
    return r ?? null
  })

  const settings = {
    displayName: row?.displayName ?? "",
    purpose: row?.purpose ?? "",
    contactEmail: row?.contactEmail ?? "",
    contactPhone: row?.contactPhone ?? "",
    website: row?.website ?? "",
  }

  // Keyed on the resolved values: `SettingsForm`'s local edit state only
  // initializes on mount, so after a save the server may return normalized
  // values (trimmed) that differ from the client's raw input — without a
  // fresh mount the form would spuriously stay "dirty". Remounting on
  // change is simpler and safer than a resync effect.
  return <SettingsForm key={JSON.stringify(settings)} settings={settings} />
}
