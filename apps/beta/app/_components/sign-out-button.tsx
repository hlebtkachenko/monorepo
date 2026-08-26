"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@workspace/ui/components/button"

import { useBetaTranslations } from "@/i18n/translations"
import { betaAuthClient } from "@/lib/auth/client"

/**
 * The bare sign-out control, for the two surfaces that draw their own chrome
 * and have no account menu: the pre-org root picker and /admin. Inside the org
 * shell, sign-out lives in `AccountMenu` instead (PR 21) — an account menu that
 * did not carry it would be the first place a user looks and does not find it.
 *
 * Better Auth deletes the `auth_session` row and clears the cookie in one
 * response; `router.refresh()` then makes the portal guard re-evaluate and
 * redirect.
 *
 * Shared (`app/_components/`) rather than owned by one route group: both
 * consumers are outside the portal shell.
 */
export function SignOutButton() {
  const t = useBetaTranslations()
  const router = useRouter()
  const [pending, setPending] = React.useState(false)

  async function handleClick() {
    setPending(true)
    await betaAuthClient.signOut()
    router.replace("/sign-in")
    router.refresh()
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => void handleClick()}
    >
      {t("auth.signOut")}
    </Button>
  )
}
