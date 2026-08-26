"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@workspace/ui/components/button"

import { useBetaTranslations } from "@/i18n/translations"
import { betaAuthClient } from "@/lib/auth/client"

/**
 * Sign-out lives here until the header account menu lands with Nastavení ›
 * Účet (PR 21). Better Auth deletes the `auth_session` row and clears the
 * cookie in one response; `router.refresh()` then makes the portal guard
 * re-evaluate and redirect.
 *
 * Shared (`app/_components/`) rather than owned by one route group: the portal
 * landing and the /admin chrome both draw it, and /admin lives outside the
 * portal shell entirely.
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
