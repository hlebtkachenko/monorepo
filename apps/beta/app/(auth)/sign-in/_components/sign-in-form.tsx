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
 *
 * SECOND FACTOR (PR 21). When the account has TOTP enabled, `signIn.email`
 * does NOT return a session: the twoFactor() plugin deletes the one the
 * credential step minted, sets a short-lived challenge cookie, and answers
 * `{ twoFactorRedirect: true }`. The form swaps to a code step in place rather
 * than navigating — a redirect to a separate page would drop the fetch client's
 * in-flight state and gains nothing, since the challenge is carried by a cookie.
 *
 * A BACKUP CODE IS ACCEPTED IN THE SAME STEP, behind a link rather than a
 * second visible field: it is the "my phone is gone" path, and every code
 * consumed is one fewer. Both endpoints are budgeted at 5/minute
 * (`BETA_RATE_LIMIT_RULES`), so neither is a six-digit oracle.
 *
 * "Wrong code" and "wrong backup code" are the same sentence for the same
 * reason the credential errors are.
 */
export function SignInForm() {
  const t = useBetaTranslations()
  const router = useRouter()
  const [error, setError] = React.useState<BetaMessageKey | null>(null)
  const [pending, setPending] = React.useState(false)
  const [step, setStep] = React.useState<"credentials" | "twoFactor">(
    "credentials",
  )
  const [useBackupCode, setUseBackupCode] = React.useState(false)

  function land(): void {
    router.replace("/")
    router.refresh()
  }

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

    // The plugin's response shape for an account with 2FA on. No session cookie
    // was set; the challenge cookie was.
    if (
      typeof result.data === "object" &&
      result.data !== null &&
      "twoFactorRedirect" in result.data &&
      result.data.twoFactorRedirect === true
    ) {
      setPending(false)
      setStep("twoFactor")
      return
    }

    land()
  }

  async function handleTwoFactor(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const code = String(new FormData(event.currentTarget).get("code") ?? "")
    setError(null)
    setPending(true)

    const result = useBackupCode
      ? await betaAuthClient.twoFactor.verifyBackupCode({ code })
      : await betaAuthClient.twoFactor.verifyTotp({ code })

    if (result.error) {
      setError(
        result.error.status === 429
          ? "auth.tooManyAttempts"
          : "auth.invalidCode",
      )
      setPending(false)
      return
    }

    land()
  }

  if (step === "twoFactor") {
    return (
      <form className="grid gap-4" onSubmit={(e) => void handleTwoFactor(e)}>
        <div className="grid gap-2">
          <Label htmlFor="code">
            {t(useBackupCode ? "auth.backupCodeLabel" : "auth.totpCodeLabel")}
          </Label>
          <Input
            id="code"
            name="code"
            inputMode={useBackupCode ? "text" : "numeric"}
            autoComplete="one-time-code"
            autoFocus
            required
          />
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{t(error)}</AlertDescription>
          </Alert>
        ) : null}

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? t("auth.pending") : t("auth.verifySubmit")}
        </Button>

        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={() => {
            setUseBackupCode((previous) => !previous)
            setError(null)
          }}
        >
          {t(useBackupCode ? "auth.useTotpCode" : "auth.useBackupCode")}
        </Button>
      </form>
    )
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
