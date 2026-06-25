import type { ReactNode } from "react"
import { eq } from "drizzle-orm"

import { withAdminBypass } from "@workspace/db"
import { organization } from "@workspace/db/schema"

import { DetailTabsHeader } from "../../_components/detail-tabs-header"

async function loadOrgName(id: string): Promise<string> {
  try {
    const row = await withAdminBypass(async (db) => {
      const [r] = await db
        .select({
          slug: organization.slug,
          legal_name: organization.legal_name,
        })
        .from(organization)
        .where(eq(organization.id, id))
        .limit(1)
      return r ?? null
    })
    return row?.legal_name || row?.slug || id
  } catch {
    return id
  }
}

export default async function OrgDetailLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const name = await loadOrgName(id)
  const base = `/orgs/${id}`

  return (
    <>
      <DetailTabsHeader
        title={name}
        tabs={[
          { value: "overview", label: "Overview", href: base },
          { value: "members", label: "Members", href: `${base}/members` },
          { value: "activity", label: "Activity", href: `${base}/activity` },
        ]}
      />
      {children}
    </>
  )
}
