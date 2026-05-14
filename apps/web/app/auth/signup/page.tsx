import { headers } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@workspace/auth/server"
import { TokenError } from "@workspace/auth/tokens"
import { getTranslations } from "@workspace/i18n/server"
import {
  AuthShell,
  AuthShellAside,
  AuthShellBody,
  AuthShellFooter,
  AuthShellHeader,
  AuthShellLeft,
} from "@workspace/ui/components/auth-shell"
import {
  AuthAside,
  AuthAsideHeadline,
  AuthAsideQuote,
  AuthAsideSubtitle,
} from "@workspace/ui/components/auth-aside"
import { Button } from "@workspace/ui/components/button"

import { readSignupClaims } from "../../onboarding/_lib/signup-cookie"
import { resolveNextStep, stepPath } from "../../onboarding/_lib/resume"

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
    const next = await resolveNextStep(session.user.id)
    redirect(stepPath(next))
  }

  const t = await getTranslations("auth.signup.welcome")
  const tBrand = await getTranslations("brand")
  const tAside = await getTranslations("auth.aside")
  const brandName = tBrand("name")

  // Decide which onboarding step to land the visitor on. If they already
  // completed steps 1 + 2 (state cookie present) they jump straight to
  // password; first-time visitors start at /onboarding/profile.
  const next = await resolveNextStep(null)

  return (
    <AuthShell>
      <AuthShellLeft>
        <AuthShellHeader>
          <span className="text-base font-semibold tracking-tight">
            {brandName}
          </span>
        </AuthShellHeader>
        <AuthShellBody>
          <div className="flex flex-col gap-8">
            <header className="flex flex-col gap-2">
              <h1 className="font-heading text-3xl font-semibold tracking-tight">
                {t("title", { brand: brandName })}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t("description")}
              </p>
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
                <dd className="text-xs text-muted-foreground">
                  {t("validity")}
                </dd>
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
        </AuthShellBody>
        <AuthShellFooter>
          <span>
            © {new Date().getFullYear()} {brandName}
          </span>
        </AuthShellFooter>
      </AuthShellLeft>
      <AuthShellAside>
        <AuthAside variant="photo" image="/auth/aside-bg.jpg">
          <AuthAsideHeadline>{tAside("headline")}</AuthAsideHeadline>
          <AuthAsideSubtitle>{tAside("subtitle")}</AuthAsideSubtitle>
          <AuthAsideQuote
            author={tAside("quote.author")}
            role={tAside("quote.role")}
          >
            {tAside("quote.text")}
          </AuthAsideQuote>
        </AuthAside>
      </AuthShellAside>
    </AuthShell>
  )
}
