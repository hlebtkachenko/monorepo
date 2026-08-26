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

import type { ConsumeFormState } from "../_actions/state"

/**
 * The form behind both one-time-link screens.
 *
 * Two steps on purpose. The Server Action consumes the link and creates or
 * updates the credential; the browser then signs in against `/api/auth`, so the
 * session cookie arrives on the same response that mints it and the sign-in
 * still passes through Better Auth's rate limiter. A session established inside
 * a Server Action does not reliably carry its Set-Cookie back (the trap that
 * produced HI-6 in the main app).
 *
 * The token travels in a hidden field of a POST, never as a query parameter of
 * whatever comes next.
 *
 * `askPassword` is false for exactly one case: an org invite opened by the
 * signed-in owner of that same address. There is no password to set there — the
 * link only adds a membership — and offering the field would imply a password
 * change that does not happen.
 */
export function ConsumeForm({
  token,
  email,
  organizationName,
  submitLabel,
  askName,
  askPassword,
  action,
}: Readonly<{
  token: string
  email: string
  organizationName: string | null
  submitLabel: string
  askName: boolean
  askPassword: boolean
  action: (formData: FormData) => Promise<ConsumeFormState>
}>) {
  const t = useBetaTranslations()
  const router = useRouter()
  const [error, setError] = React.useState<BetaMessageKey | null>(null)
  const [pending, setPending] = React.useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    formData.set("token", token)
    setError(null)
    setPending(true)

    const state = await action(formData)
    if (state.status === "error") {
      setError(state.error)
      setPending(false)
      return
    }

    if (state.signIn) {
      const result = await betaAuthClient.signIn.email({
        email: state.email,
        password: String(formData.get("password") ?? ""),
      })
      if (result.error) {
        setError("auth.consumedSignInFailed")
        setPending(false)
        return
      }
    }

    router.replace(state.redirectTo)
    router.refresh()
  }

  return (
    <form className="grid gap-4" onSubmit={(e) => void handleSubmit(e)}>
      <div className="grid gap-1">
        <span className="text-xs text-muted-foreground">
          {t("auth.accountLabel")}
        </span>
        <span className="text-sm font-medium">{email}</span>
      </div>

      {organizationName ? (
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">
            {t("auth.organizationLabel")}
          </span>
          <span className="text-sm font-medium">{organizationName}</span>
        </div>
      ) : null}

      {askName ? (
        <div className="grid gap-2">
          <Label htmlFor="name">{t("auth.nameLabel")}</Label>
          <Input id="name" name="name" autoComplete="name" />
        </div>
      ) : null}

      {askPassword ? (
        <div className="grid gap-2">
          <Label htmlFor="password">{t("auth.newPasswordLabel")}</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
          />
          <p className="text-xs text-muted-foreground">
            {t("auth.passwordHint")}
          </p>
        </div>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{t(error)}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? t("auth.pending") : submitLabel}
      </Button>
    </form>
  )
}
