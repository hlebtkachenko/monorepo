import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { auth } from "@workspace/auth/server"
import { withAdminBypass } from "@workspace/db"
import {
  organization,
  organization_membership,
  resource_grant,
  workspace,
  workspace_membership,
} from "@workspace/db/schema"

import { ReadOnlyProfileDetails } from "@/app/_components/workspace/profile/read-only-profile-details"

export const metadata = { title: "Profile permissions" }

export default async function ProfilePermissionsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/auth/login")

  const { workspaceRoles, organizationRoles, resourceGrants } =
    await withAdminBypass(async (db) => {
      const [workspaceRoles, organizationRoles, resourceGrants] =
        await Promise.all([
          db
            .select({
              id: workspace_membership.id,
              workspace: workspace.display_name,
              role: workspace_membership.role,
              active: workspace_membership.active,
            })
            .from(workspace_membership)
            .innerJoin(
              workspace,
              eq(workspace.id, workspace_membership.workspace_id),
            )
            .where(eq(workspace_membership.user_id, session.user.id)),
          db
            .select({
              id: organization_membership.id,
              organization: organization.legal_name,
              role: organization_membership.role,
              active: organization_membership.active,
            })
            .from(organization_membership)
            .innerJoin(
              organization,
              eq(organization.id, organization_membership.organization_id),
            )
            .where(eq(organization_membership.user_id, session.user.id)),
          db
            .select({
              id: resource_grant.id,
              organization: organization.legal_name,
              resourceType: resource_grant.resource_type,
              canView: resource_grant.can_view,
              canEdit: resource_grant.can_edit,
              canDelete: resource_grant.can_delete,
            })
            .from(resource_grant)
            .innerJoin(
              workspace_membership,
              eq(workspace_membership.id, resource_grant.membership_id),
            )
            .leftJoin(
              organization,
              eq(organization.id, resource_grant.organization_id),
            )
            .where(eq(workspace_membership.user_id, session.user.id)),
        ])
      return { workspaceRoles, organizationRoles, resourceGrants }
    })

  return (
    <ReadOnlyProfileDetails
      title="Profile permissions"
      groups={[
        {
          title: "Roles and permissions",
          sections: [
            {
              kind: "table",
              props: {
                title: "Workspace permissions",
                description:
                  "Your access level in every workspace you belong to.",
                mode: "readonly",
                emptyText: "No workspace membership found.",
                columns: [
                  {
                    id: "workspace",
                    header: "Workspace",
                    span: 3,
                    control: { kind: "text" },
                  },
                  {
                    id: "role",
                    header: "Role",
                    span: 2,
                    control: { kind: "text" },
                  },
                  {
                    id: "status",
                    header: "Status",
                    span: 1,
                    control: { kind: "text" },
                  },
                ],
                rows: workspaceRoles.map((item) => ({
                  id: item.id,
                  cells: {
                    workspace: item.workspace,
                    role: item.role,
                    status: item.active ? "Active" : "Inactive",
                  },
                })),
              },
            },
            {
              kind: "table",
              props: {
                title: "Organization permissions",
                description: "Your role for each company in your workspaces.",
                mode: "readonly",
                emptyText: "No organization membership found.",
                columns: [
                  {
                    id: "organization",
                    header: "Organization",
                    span: 3,
                    control: { kind: "text" },
                  },
                  {
                    id: "role",
                    header: "Role",
                    span: 2,
                    control: { kind: "text" },
                  },
                  {
                    id: "status",
                    header: "Status",
                    span: 1,
                    control: { kind: "text" },
                  },
                ],
                rows: organizationRoles.map((item) => ({
                  id: item.id,
                  cells: {
                    organization: item.organization,
                    role: item.role,
                    status: item.active ? "Active" : "Inactive",
                  },
                })),
              },
            },
            {
              kind: "table",
              props: {
                title: "Granted permissions",
                description:
                  "Explicit resource access assigned to your workspace membership.",
                mode: "readonly",
                emptyText: "No additional resource permissions assigned.",
                columns: [
                  {
                    id: "scope",
                    header: "Scope",
                    span: 2,
                    control: { kind: "text" },
                  },
                  {
                    id: "resource",
                    header: "Resource",
                    span: 2,
                    control: { kind: "text" },
                  },
                  {
                    id: "permissions",
                    header: "Permissions",
                    span: 2,
                    control: { kind: "text" },
                  },
                ],
                rows: resourceGrants.map((item) => ({
                  id: item.id,
                  cells: {
                    scope: item.organization ?? "Workspace",
                    resource: item.resourceType,
                    permissions:
                      [
                        item.canView ? "View" : null,
                        item.canEdit ? "Edit" : null,
                        item.canDelete ? "Delete" : null,
                      ]
                        .filter((value): value is string => value !== null)
                        .join(", ") || "None",
                  },
                })),
              },
            },
          ],
        },
      ]}
    />
  )
}
