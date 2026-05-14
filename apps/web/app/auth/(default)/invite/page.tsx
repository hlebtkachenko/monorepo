import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@workspace/auth/server"
import { getTranslations } from "@workspace/i18n/server"

import { readInviteClaims } from "../../../onboarding/member/_lib/invite-cookie"
import { signOutForInviteAction } from "./actions"
import { InviteWelcomeActions } from "./invite-welcome-actions"

export async function generateMetadata() {
  const t = await getTranslations("auth.invite")
  return { title: t("metaTitle") }
}

export default async function InviteWelcomePage() {
  const claims = await readInviteClaims()
  if (!claims) {
    redirect("/auth/login?error=missing-invite-token")
  }

  const session = await auth.api.getSession({ headers: await headers() })
  const sessionEmail = session?.user.email?.toLowerCase()
  const inviteEmail = claims.email.toLowerCase()
  const isSignedIn = !!sessionEmail
  const matchesSession = sessionEmail === inviteEmail

  const t = await getTranslations("auth.invite.welcome")
  const tBrand = await getTranslations("brand")
  const brandName = tBrand("name")

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("description", { brand: brandName })}
        </p>
      </header>

      <dl className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">{t("issuedTo")}</dt>
          <dd className="font-medium">{claims.email}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">{t("role")}</dt>
          <dd className="font-medium">{claims.role}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">{t("validity")}</dt>
          <dd className="text-xs text-muted-foreground" />
        </div>
      </dl>

      {isSignedIn && !matchesSession ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-destructive" role="alert">
            {t("wrongEmail", {
              email: claims.email,
              sessionEmail: session!.user.email!,
            })}
          </p>
          <form action={signOutForInviteAction}>
            <button
              type="submit"
              className="text-sm underline-offset-4 hover:text-foreground hover:underline"
            >
              {t("signOut")}
            </button>
          </form>
        </div>
      ) : (
        <InviteWelcomeActions alreadySignedIn={matchesSession} />
      )}
    </div>
  )
}
