import { getTranslations } from "@workspace/i18n/server"

import { ForgotPasswordForm } from "./forgot-password-form"

export async function generateMetadata() {
  const t = await getTranslations("auth.forgot")
  return { title: t("metaTitle") }
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />
}
