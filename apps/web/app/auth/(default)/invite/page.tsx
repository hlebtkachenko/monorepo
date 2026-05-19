import { headers } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@workspace/auth/server"
import { truncateIp } from "@workspace/auth/tokens"
import { getTranslations } from "@workspace/i18n/server"
import { Button } from "@workspace/ui/components/button"
import { Heading } from "@workspace/ui/components/heading"
import { Text } from "@workspace/ui/components/text"
import { ArrowRightIcon, ArrowUpRight } from "@workspace/ui/lib/icons"

import { isDevPreview } from "@/lib/dev-preview"
import { checkSignupRateLimit } from "@/lib/signup-rate-limit"

import { readInviteClaims } from "../../../onboarding/_lib/invite-cookie"
import { InviteWelcomeActions } from "./invite-welcome-actions"

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata() {
  const t = await getTranslations("auth.invite")
  return { title: t("metaTitle") }
}

/**
 * GET /auth/invite
 *
 * Single welcome route, collapsing the previous /start → /landing two-hop.
 * Behavior depends on what the request carries:
 *
 * 1. `?token=<raw>` — the email link landed here directly. Render the
 *    intermediate "Continue" form whose POST hits /auth/invite/consume.
 *    Defers state change to a human submit so prefetch scanners can't
 *    burn the token by GET'ing the URL.
 *
 * 2. `?invalid=1` — the consume route bounced back after a failure.
 *    Render a generic error card with no failure-mode details.
 *
 * 3. No token in the URL, invite-payload cookie present — render the
 *    actual "Welcome, <email>" card with the accept button.
 */
export default async function InviteWelcomePage({ searchParams }: PageProps) {
  const params = await searchParams
  const token = typeof params["token"] === "string" ? params["token"] : null
  const isInvalid = params["invalid"] === "1"

  if (isInvalid) {
    return renderInvalid()
  }

  if (token) {
    // Per-IP rate limit on the welcome GET. We do NOT decode the token
    // here (no DB hit on prefetch), so per-email is skipped until the
    // consume route can decode the payload.
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

  // No token in the URL — the consume route already ran. Read claims
  // from the payload cookie.
  let claims = await readInviteClaims()
  if (!claims && (await isDevPreview())) {
    claims = {
      id: "preview",
      email: "preview@example.com",
      organizationId: "preview",
      workspaceId: "preview",
      role: "member",
      status: "pending",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }
  }
  if (!claims) {
    redirect("/auth/login?error=missing-invite-token")
  }

  const session = await auth.api.getSession({ headers: await headers() })
  const sessionEmail = session?.user.email?.toLowerCase() ?? null
  const inviteEmail = claims.email.toLowerCase()
  const isSignedIn = !!sessionEmail
  const matchesSession = sessionEmail === inviteEmail

  return (
    <InviteWelcomeActions
      email={claims.email}
      role={claims.role}
      isSignedIn={isSignedIn}
      matchesSession={matchesSession}
      sessionEmail={session?.user.email ?? null}
    />
  )
}

async function renderContinueForm(token: string) {
  const t = await getTranslations("auth.invite.landing")
  const tBrand = await getTranslations("brand")
  const brandName = tBrand("name")
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Heading level={2} className="mt-0">
          {t("title")}
        </Heading>
        <Text variant="muted">{t("descriptionGeneric")}</Text>
      </header>

      <form method="POST" action="/auth/invite/consume">
        <input type="hidden" name="token" value={token} />
        <Button type="submit" size="xl" className="w-full">
          {t("continue")}
          <ArrowRightIcon className="size-4" aria-hidden="true" />
        </Button>
      </form>

      <Text variant="muted" className="text-sm">
        {brandName}
      </Text>
    </div>
  )
}

async function renderInvalid() {
  const t = await getTranslations("auth.invite.landing")
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Heading level={2} className="mt-0">
          {t("invalid.title")}
        </Heading>
        <Text variant="muted">{t("invalid.description")}</Text>
      </header>
      <Button asChild size="xl">
        <Link href="#">
          {t("invalid.contactSupport")}
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </Link>
      </Button>
    </div>
  )
}
