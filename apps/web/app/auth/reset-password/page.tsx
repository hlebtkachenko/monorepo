import { Suspense } from "react"
import { getTranslations } from "@workspace/i18n/server"

import { ResetPasswordForm } from "./reset-password-form"

export async function generateMetadata() {
  const t = await getTranslations("auth.reset")
  return { title: t("metaTitle") }
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  )
}
