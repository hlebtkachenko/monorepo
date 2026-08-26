"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@workspace/ui/components/button"

import { TotpEnrolment } from "@/app/_components/totp-enrolment"
import { useBetaTranslations } from "@/i18n/translations"
import { betaAuthClient } from "@/lib/auth/client"

/**
 * The forced screen's body: the shared enrolment flow, plus the one other thing
 * a person stuck here may legitimately want to do.
 *
 * SIGN OUT IS THE ONLY WAY PAST. Not a "later" button, not a dismissal — the
 * mandate is the point, and a way to skip it would make the whole gate
 * advisory. Signing out is offered because the alternative is a person who
 * opened the wrong account on a shared machine having no exit at all.
 *
 * On success it navigates to `/` — spec §2.0.1's endpoint for the owner's first
 * login ("setup link → password → forced TOTP → `/`"). `refresh()` after
 * `replace()` is what makes the server re-evaluate `requireTotpEnrolment()` with
 * the new `two_factor_enabled`; without it the cached RSC payload for `/` would
 * still be the one that redirected back here.
 */
export function ForcedTotpEnrolment() {
  const t = useBetaTranslations()
  const router = useRouter()
  const [signingOut, setSigningOut] = React.useState(false)

  async function handleSignOut(): Promise<void> {
    setSigningOut(true)
    await betaAuthClient.signOut()
    router.replace("/sign-in")
    router.refresh()
  }

  return (
    <div className="grid gap-4">
      <TotpEnrolment
        submitLabelKey="auth.totpSetupStart"
        onEnrolled={() => {
          router.replace("/")
          router.refresh()
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={signingOut}
        onClick={() => void handleSignOut()}
        className="justify-self-start"
      >
        {t("auth.signOut")}
      </Button>
    </div>
  )
}
