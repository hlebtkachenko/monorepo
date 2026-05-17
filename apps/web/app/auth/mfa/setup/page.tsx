import { Suspense } from "react"
import type { Metadata } from "next"

import { getTranslations } from "@workspace/i18n/server"

import { MfaSetupForm } from "./mfa-setup-form"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.mfa.setup")
  return { title: t("metaTitle") }
}

export default function MfaSetupPage() {
  return (
    <Suspense fallback={null}>
      <MfaSetupForm />
    </Suspense>
  )
}
