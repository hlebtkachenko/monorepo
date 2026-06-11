import { headers } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@workspace/auth/server"
import { truncateIp } from "@workspace/auth/tokens"
import { getTranslations } from "@workspace/i18n/server"
import { BRAND_SUPPORT_EMAIL } from "@workspace/ui/brand-assets"
import {
  AuthTokenContinueCard,
  AuthTokenInvalidCard,
} from "@workspace/ui/blocks/auth"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Heading } from "@workspace/ui/components/heading"
import { Input } from "@workspace/ui/components/input"
import { Text } from "@workspace/ui/components/text"
import { ArrowRightIcon, ArrowUpRight } from "@workspace/ui/lib/icons"

import { isDevPreview } from "@/lib/dev-preview"
import { checkSignupRateLimit } from "@/lib/signup-rate-limit"

import { readSignupClaims } from "../../../onboarding/_lib/signup-cookie"
import { resolveNextStep, stepPath } from "../../../onboarding/_lib/resume"
import { signOutForSignupAction } from "./actions"

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata() {
  const t = await getTranslations("auth.signup")
  return { title: t("metaTitle") }
}

/**
 * GET /auth/signup
 *
 * Single welcome route, collapsing the previous /start → /landing two-hop.
 * Behavior depends on what the request carries:
 *
 * 1. `?token=<raw>` in the URL — the email link landed here directly.
 *    Render an intermediate "Continue" form whose POST hits
 *    /auth/signup/consume. The form body carries the token; the consume
 *    handler does the actual redemption + sets the payload cookie. This
 *    defers any state change to a human-driven submit, so email
 *    prefetchers can't burn the token by GET'ing the URL.
 *
 * 2. `?invalid=1` in the URL — the consume route bounced back after a
 *    failure (expired / revoked / wrong kind / rate limited). Render a
 *    generic error card with no failure-mode details.
 *
 * 3. No token, signup-payload cookie present — the user already consumed
 *    via /consume, the auth + payload cookies are set. Render the actual
 *    "Welcome, <email>" card and continue into the onboarding wizard.
 */
export default async function SignupWelcomePage({ searchParams }: PageProps) {
  const params = await searchParams
  const token = typeof params["token"] === "string" ? params["token"] : null
  const isInvalid = params["invalid"] === "1"

  if (isInvalid) {
    return renderInvalid()
  }

  if (token) {
    // Per-IP rate limit on the welcome GET. We do NOT decode the token
    // here (would require a DB hit on every prefetch), so per-email is
    // skipped at this stage — the consume route enforces per-email
    // after it knows the email.
    const reqHeaders = await headers()
    const rawIp =
      reqHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
    const ip = truncateIp(rawIp)
    const blocked = checkSignupRateLimit({ ip, email: null })
    if (blocked) {
      return renderInvalid()
    }
    return renderContinueForm(token)
  }

  // No token in the URL — must already have consumed and be in the
  // session-cookie phase. Read the payload cookie + auth cookie set by
  // /auth/signup/consume.
  let claims = await readSignupClaims()
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
        <a
          href={`mailto:${BRAND_SUPPORT_EMAIL}`}
          className="inline-flex items-center gap-0.5 font-medium text-foreground underline-offset-4 hover:underline"
        >
          {t("contactSupport", { brand: brandName })}
          <ArrowUpRight className="size-3" aria-hidden="true" />
        </a>
      </Text>
    </div>
  )
}

async function renderContinueForm(token: string) {
  const t = await getTranslations("auth.signup.landing")
  const tBrand = await getTranslations("brand")
  return (
    <AuthTokenContinueCard
      title={t("title")}
      description={t("descriptionGeneric")}
      continueLabel={t("continue")}
      action="/auth/signup/consume"
      token={token}
      footnote={tBrand("name")}
    />
  )
}

async function renderInvalid() {
  const t = await getTranslations("auth.signup.landing")
  return (
    <AuthTokenInvalidCard
      title={t("invalid.title")}
      description={t("invalid.description")}
      contactLabel={t("invalid.contactSupport")}
      contactHref={`mailto:${BRAND_SUPPORT_EMAIL}`}
    />
  )
}
