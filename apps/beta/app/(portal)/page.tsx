import { getBetaTranslations } from "@/i18n/translations-server"
import { requireBetaSession } from "@/lib/auth/session"

import { SignOutButton } from "./_components/sign-out-button"

/**
 * Portal root. Still a landing card: org routing ("one active membership →
 * redirect to it, several → the picker") lands with PR 09. What it does carry
 * now is a real session — the layout guard has already run.
 */
export default async function PortalHomePage() {
  const t = await getBetaTranslations()
  const session = await requireBetaSession()
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          {t("landing.heading")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("landing.intro")}</p>
        <p className="text-sm font-medium">{session.email}</p>
        <SignOutButton />
      </div>
    </div>
  )
}
