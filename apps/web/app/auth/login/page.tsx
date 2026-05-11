import { Suspense } from "react"
import { getTranslations } from "@workspace/i18n/server"
import { LoginForm } from "./login-form"

export async function generateMetadata() {
  const t = await getTranslations("auth.login")
  return { title: t("metaTitle") }
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
