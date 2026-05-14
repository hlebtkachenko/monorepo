import { headers } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@workspace/auth/server"
import { TokenError } from "@workspace/auth/tokens"
import { getTranslations } from "@workspace/i18n/server"
import { Button } from "@workspace/ui/components/button"

import { readSignupClaims } from "../../../onboarding/_lib/signup-cookie"
import { resolveNextStep, stepPath } from "../../../onboarding/_lib/resume"

export async function generateMetadata() {
  const t = await getTranslations("auth.signup")
  return { title: t("metaTitle") }
}

export default async function SignupWelcomePage() {
  let claims
  try {
    claims = await readSignupClaims()
  } catch (err) {
    if (err instanceof TokenError) {
      redirect("/auth/login?error=" + err.code.toLowerCase())
    }
    throw err
  }
  if (!claims) {
    redirect("/auth/login?error=missing-signup-token")
  }

  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) {
    if (session.user.email.toLowerCase() !== claims.email.toLowerCase()) {
      redirect("/auth/login?error=signup-email-mismatch")
    }
    const next = await resolveNextStep(session.user.id)
    redirect(stepPath(next))
  }

  const t = await getTranslations("auth.signup.welcome")
  const tBrand = await getTranslations("brand")
  const brandName = tBrand("name")

  const next = await resolveNextStep(null)

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          {t("title", { brand: brandName })}
        </h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>

      <dl className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">{t("issuedTo")}</dt>
          <dd className="font-medium">{claims.email}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">{t("role")}</dt>
          <dd className="font-medium">{t("ownerRole")}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">{claims.workspace}</dt>
          <dd className="text-xs text-muted-foreground">{t("validity")}</dd>
        </div>
      </dl>

      <Button asChild size="lg">
        <Link href={stepPath(next)}>{t("continue")}</Link>
      </Button>

      <p className="text-sm text-muted-foreground">
        {t("alreadyHave")}{" "}
        <Link
          href="/auth/login"
          className="underline-offset-4 hover:text-foreground hover:underline"
        >
          {t("signIn")}
        </Link>
      </p>
    </div>
  )
}
