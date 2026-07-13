import { auditAdminAction } from "@/lib/admin-audit"

import { UTILITY_PAGE_IDS } from "@workspace/ui/blocks/utility-page"

import { PageHeader } from "../../_components/page-header"
import { UtilityPageCatalog } from "./_components/utility-page-catalog"

export const metadata = { title: "Utility pages" }

export default async function UtilityPagesPage() {
  await auditAdminAction({
    action: "admin.platform.utility_pages_viewed",
    payload: { total: UTILITY_PAGE_IDS.length },
  })

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Utility pages"
        description="Read-only catalog of supported states, copy, recovery actions, and operational policy. Definitions are compiled into the UI package so they remain available during service failures."
        meta={`${UTILITY_PAGE_IDS.length} supported states`}
      />
      <UtilityPageCatalog />
    </div>
  )
}
