import { redirect } from "next/navigation"

import { getBetaTranslations } from "@/i18n/translations-server"
import { getBetaSession } from "@/lib/auth/session"

import { AuthCard } from "../_components/auth-card"
import { SignInForm } from "./_components/sign-in-form"

export default async function SignInPage() {
  // Already signed in: nothing to do here.
  if (await getBetaSession()) redirect("/")

  const t = await getBetaTranslations()
  return (
    <AuthCard
      title={t("auth.signInTitle")}
      description={t("auth.signInSubtitle")}
    >
      <SignInForm />
    </AuthCard>
  )
}
