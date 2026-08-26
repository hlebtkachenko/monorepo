"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

import type { BetaMessageKey } from "@/i18n/messages"
import { useBetaTranslations } from "@/i18n/translations"
import { betaAuthClient } from "@/lib/auth/client"

/**
 * Sign-in runs against `/api/auth` from the browser rather than through a
 * Server Action: Better Auth's rate limiter lives in its HTTP handler, so a
 * server-side `auth.api.signInEmail` would quietly bypass it.
 *
 * Wrong password, unknown address and deactivated account all render the same
 * sentence. Only a 429 says something different, because "slow down" is not an
 * answer about the account.
 */
export function SignInForm() {
  const t = useBetaTranslations()
  const router = useRouter()
  const [error, setError] = React.useState<BetaMessageKey | null>(null)
  const [pending, setPending] = React.useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setError(null)
    setPending(true)

    const result = await betaAuthClient.signIn.email({
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    })

    if (result.error) {
      setError(
        result.error.status === 429
          ? "auth.tooManyAttempts"
          : "auth.invalidCredentials",
      )
      setPending(false)
      return
    }

    router.replace("/")
    router.refresh()
  }

  return (
    <form className="grid gap-4" onSubmit={(e) => void handleSubmit(e)}>
      <div className="grid gap-2">
        <Label htmlFor="email">{t("auth.emailLabel")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          autoCapitalize="none"
          required
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="password">{t("auth.passwordLabel")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{t(error)}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? t("auth.pending") : t("auth.signInSubmit")}
      </Button>
    </form>
  )
}
