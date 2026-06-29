import type { ReactNode } from "react"
import { eq } from "drizzle-orm"

import { withAdminBypass } from "@workspace/db"
import { app_user } from "@workspace/db/schema"

import { DetailTabsHeader } from "../../_components/detail-tabs-header"

async function loadUserName(id: string): Promise<string> {
  try {
    const row = await withAdminBypass(async (db) => {
      const [r] = await db
        .select({
          name: app_user.name,
          display_name: app_user.display_name,
          email: app_user.email,
        })
        .from(app_user)
        .where(eq(app_user.id, id))
        .limit(1)
      return r ?? null
    })
    return row?.display_name || row?.name || row?.email || id
  } catch {
    return id
  }
}

export default async function UserDetailLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const name = await loadUserName(id)
  const base = `/users/${id}`

  return (
    <>
      <DetailTabsHeader
        title={name}
        tabs={[
          { value: "overview", label: "Overview", href: base },
          { value: "sessions", label: "Sessions", href: `${base}/sessions` },
          { value: "security", label: "Security", href: `${base}/security` },
          { value: "timeline", label: "Timeline", href: `${base}/timeline` },
        ]}
      />
      {children}
    </>
  )
}
