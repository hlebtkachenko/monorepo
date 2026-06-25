"use client"

import { useRouter } from "next/navigation"

import { authClient } from "@workspace/auth/client"
import { Button } from "@workspace/ui/components/button"

import { clearAdminCookies } from "./sign-out-action"

/** Sign out of the admin surface and return to the login page. */
export function SignOutButton() {
  const router = useRouter()

  async function onClick() {
    await authClient.signOut()
    // HttpOnly admin-only cookies (step-up token) aren't reachable from
    // client JS — server action handles the cleanup.
    await clearAdminCookies()
    router.push("/auth/login")
    router.refresh()
  }

  return (
    <Button variant="outline" onClick={onClick}>
      Sign out
    </Button>
  )
}
