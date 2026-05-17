"use client"

import { useRouter } from "next/navigation"

import { authClient } from "@workspace/auth/client"
import { Button } from "@workspace/ui/components/button"

/** Sign out of the admin surface and return to the login page. */
export function SignOutButton() {
  const router = useRouter()

  async function onClick() {
    await authClient.signOut()
    router.push("/auth/login")
    router.refresh()
  }

  return (
    <Button variant="outline" onClick={onClick}>
      Sign out
    </Button>
  )
}
