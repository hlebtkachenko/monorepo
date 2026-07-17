import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getTranslations } from "@workspace/i18n/server"

import { safeNextPath } from "@/lib/safe-next-path"

import { readLoginEmail } from "../actions"
import { LoginMfaForm } from "./login-mfa-form"

export async function generateMetadata() {
  const t = await getTranslations("auth.login.mfa")
  return { title: t("title") }
}

export default async function LoginMfaPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const email = await readLoginEmail()
  const resolvedEmail = email
  if (!resolvedEmail) {
    // Carry the in-flight deep link forward so an expired login session
    // returns the user to the page they were signing in to reach.
    const sp = await searchParams
    const next = safeNextPath(Array.isArray(sp.next) ? sp.next[0] : sp.next)
    redirect(
      next === "/"
        ? "/auth/login?error=loginSessionExpired"
        : `/auth/login?error=loginSessionExpired&next=${encodeURIComponent(next)}`,
    )
  }
  return (
    <Suspense fallback={null}>
      <LoginMfaForm email={resolvedEmail} />
    </Suspense>
  )
}
