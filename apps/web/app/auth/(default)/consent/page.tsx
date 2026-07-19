import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@workspace/auth/server"
import { findOAuthClientDisplay } from "@workspace/auth/oauth-tenant-binding"

import { ConsentForm } from "./consent-form"

export const metadata = { title: "Authorize access" }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/auth/login")

  const sp = await searchParams
  const clientId = typeof sp.client_id === "string" ? sp.client_id : ""
  const client = clientId ? await findOAuthClientDisplay(clientId) : null
  const label = client?.name || clientId || "An application"

  return <ConsentForm clientLabel={label} clientUri={client?.uri ?? null} />
}
