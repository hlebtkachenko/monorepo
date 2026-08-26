import Link from "next/link"

import { Button } from "@workspace/ui/components/button"

import { getBetaTranslations } from "@/i18n/translations-server"

import { AuthCard } from "./auth-card"

/**
 * The one-time-link screens under their own rate limit. Says nothing about the
 * token — a real link and a guessed one produce this same card, so the limiter
 * does not become the oracle it exists to close.
 */
export async function TooManyRequests() {
  const t = await getBetaTranslations()
  return (
    <AuthCard
      title={t("auth.tooManyRequestsTitle")}
      description={t("auth.tooManyAttempts")}
    >
      <Button asChild variant="outline" className="w-full">
        <Link href="/sign-in">{t("auth.backToSignIn")}</Link>
      </Button>
    </AuthCard>
  )
}
