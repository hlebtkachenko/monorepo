import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getTranslations } from "@workspace/i18n/server"

import { readLoginEmail } from "../actions"
import { LoginPasswordForm } from "./login-password-form"

export async function generateMetadata() {
  const t = await getTranslations("auth.login.password")
  return { title: t("title") }
}

export default async function LoginPasswordPage() {
  const email = await readLoginEmail()
  if (!email) {
    redirect("/auth/login?error=loginSessionExpired")
  }
  return (
    <Suspense fallback={null}>
      <LoginPasswordForm email={email} />
    </Suspense>
  )
}
