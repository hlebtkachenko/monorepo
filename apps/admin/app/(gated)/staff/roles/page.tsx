import "server-only"

import { auditAdminAction } from "@/lib/admin-audit"
import { ADMIN_CAPABILITIES } from "@/lib/admin-capability"
import { DataTablePage, StubBanner, type ColumnDef } from "../../_components"

export const metadata = { title: "Staff roles" }

const COLUMNS: ColumnDef[] = [
  { key: "capability", label: "Capability" },
  { key: "requiredRole", label: "Required role" },
]

const ROWS: Array<Record<string, unknown>> = Object.entries(
  ADMIN_CAPABILITIES,
).map(([capability, requiredRole]) => ({ capability, requiredRole }))

export default async function StaffRolesPage() {
  void auditAdminAction({ action: "admin.staff.roles_viewed" })

  return (
    <div className="flex flex-col gap-4 p-6">
      <StubBanner>
        Granular roles ship later — all staff are currently &apos;admin&apos;.
      </StubBanner>
      <DataTablePage
        title="Staff roles"
        description="Capability map — every capability currently requires the 'admin' role."
        columns={COLUMNS}
        rows={ROWS}
        pagination={{
          pageIndex: 0,
          pageSize: ROWS.length,
          totalRows: ROWS.length,
        }}
        auditPrefix="admin.staff.roles"
      />
    </div>
  )
}
