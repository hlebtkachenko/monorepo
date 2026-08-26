import Link from "next/link"

import { Button } from "@workspace/ui/components/button"

import { getBetaTranslations } from "@/i18n/translations-server"

import { AuthCard } from "./auth-card"

/**
 * One screen for every unusable link: expired, revoked, already used, unknown,
 * or opened on the wrong route. The visitor is told the same thing in all five
 * cases — the difference between them is exactly what an attacker would want to
 * learn.
 */
export async function InvalidLink() {
  const t = await getBetaTranslations()
  return (
    <AuthCard
      title={t("auth.linkInvalidTitle")}
      description={t("auth.linkInvalid")}
    >
      <Button asChild variant="outline" className="w-full">
        <Link href="/sign-in">{t("auth.backToSignIn")}</Link>
      </Button>
    </AuthCard>
  )
}
