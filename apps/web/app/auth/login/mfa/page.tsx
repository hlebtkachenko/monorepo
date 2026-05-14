import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getTranslations } from "@workspace/i18n/server"

import { readLoginEmail } from "../actions"
import { LoginMfaForm } from "./login-mfa-form"

export async function generateMetadata() {
  const t = await getTranslations("auth.login.mfa")
  return { title: t("title") }
}

export default async function LoginMfaPage() {
  const email = await readLoginEmail()
  if (!email) {
    redirect("/auth/login?error=loginSessionExpired")
  }
  return (
    <Suspense fallback={null}>
      <LoginMfaForm email={email} />
    </Suspense>
  )
}
