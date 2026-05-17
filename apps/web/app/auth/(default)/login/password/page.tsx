import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getTranslations } from "@workspace/i18n/server"

import { isDevPreview } from "@/lib/dev-preview"

import { readLoginEmail } from "../actions"
import { LoginPasswordForm } from "./login-password-form"

export async function generateMetadata() {
  const t = await getTranslations("auth.login.password")
  return { title: t("title") }
}

export default async function LoginPasswordPage() {
  const email = await readLoginEmail()
  const preview = await isDevPreview()
  const resolvedEmail = email ?? (preview ? "preview@example.com" : null)
  if (!resolvedEmail) {
    redirect("/auth/login?error=loginSessionExpired")
  }
  return (
    <Suspense fallback={null}>
      <LoginPasswordForm email={resolvedEmail} />
    </Suspense>
  )
}
