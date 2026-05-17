import { headers } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@workspace/auth/server"
import { TokenError } from "@workspace/auth/tokens"
import { getTranslations } from "@workspace/i18n/server"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Heading } from "@workspace/ui/components/heading"
import { Input } from "@workspace/ui/components/input"
import { Text } from "@workspace/ui/components/text"
import { ArrowRightIcon, ArrowUpRight } from "@workspace/ui/lib/icons"

import { isDevPreview } from "@/lib/dev-preview"

import { readSignupClaims } from "../../../onboarding/_lib/signup-cookie"
import { resolveNextStep, stepPath } from "../../../onboarding/_lib/resume"
import { signOutForSignupAction } from "./actions"

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
  // Dev-preview renders the welcome card for design inspection even
  // without a real signup token.
  if (!claims && (await isDevPreview())) {
    claims = {
      kind: "signup" as const,
      email: "preview@example.com",
      workspace: "Preview Workspace",
    }
  }
  if (!claims) {
    redirect("/auth/login?error=missing-signup-token")
  }

  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) {
    if (session.user.email.toLowerCase() !== claims.email.toLowerCase()) {
      // A different account is signed in (e.g. a stale session from prior
      // testing). Don't bounce to login — that's a dead end. Render an
      // in-place screen with a working "sign out" action so the user can
      // clear the wrong session and continue with this signup link.
      const tMismatch = await getTranslations("auth.signup.mismatch")
      return (
        <div className="flex flex-col gap-8">
          <header className="flex flex-col gap-2">
            <Heading level={2} className="mt-0">
              {tMismatch("title")}
            </Heading>
            <Text variant="muted">
              {tMismatch("description", {
                sessionEmail: session.user.email,
                claimEmail: claims.email,
              })}
            </Text>
          </header>

          <Text variant="muted">{tMismatch("instruction")}</Text>

          <form action={signOutForSignupAction}>
            <Button type="submit" size="xl" className="w-full">
              {tMismatch("signOut")}
              <ArrowRightIcon className="size-4" aria-hidden="true" />
            </Button>
          </form>
        </div>
      )
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
        <Heading level={2} className="mt-0">
          {t("title")}
        </Heading>
        <Text variant="muted">{t("description", { brand: brandName })}</Text>
      </header>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="signup-email">{t("issuedTo")}</FieldLabel>
          <Input
            id="signup-email"
            type="email"
            inputSize="xl"
            value={claims.email}
            readOnly
            disabled
            autoComplete="username"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="signup-role">{t("role")}</FieldLabel>
          <Input
            id="signup-role"
            inputSize="xl"
            value={t("ownerRole")}
            readOnly
            disabled
          />
        </Field>
      </FieldGroup>

      <Button asChild size="xl">
        <Link href={stepPath(next)}>
          {t("continue")}
          <ArrowRightIcon className="size-4" aria-hidden="true" />
        </Link>
      </Button>

      <Text variant="muted">
        {t("wrongInvite")}{" "}
        <Link
          href="#"
          className="inline-flex items-center gap-0.5 font-medium text-foreground underline-offset-4 hover:underline"
        >
          {t("contactSupport", { brand: brandName })}
          <ArrowUpRight className="size-3" aria-hidden="true" />
        </Link>
      </Text>
    </div>
  )
}
