import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@workspace/auth/server"
import { listActiveOrganizationsForUser } from "@workspace/auth/oauth-tenant-binding"

import { SelectOrganizationForm } from "./select-organization-form"

export const metadata = { title: "Select organization" }

export default async function SelectOrganizationPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) redirect("/auth/login")

  const organizations = await listActiveOrganizationsForUser(session.user.id)
  return <SelectOrganizationForm organizations={organizations} />
}
