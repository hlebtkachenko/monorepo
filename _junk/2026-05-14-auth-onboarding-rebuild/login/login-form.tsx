"use client"

import { useState, type FormEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { authClient } from "@workspace/auth/client"
import { useTranslations } from "@workspace/i18n/client"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

const KNOWN_ERROR_CODES = [
  "no-workspace-access",
  "signup-session-expired",
  "invite-session-expired",
  "missing-signup-token",
  "missing-invite-token",
  "expired",
  "invalid",
  "wrong_kind",
  "disabled",
] as const

function isKnownErrorCode(
  code: string,
): code is (typeof KNOWN_ERROR_CODES)[number] {
  return (KNOWN_ERROR_CODES as readonly string[]).includes(code)
}

export function LoginForm() {
  const router = useRouter()
  const search = useSearchParams()
  const next = search.get("next") ?? "/workspace"
  const errorCode = search.get("error")
  const t = useTranslations("auth.login")
  const tErrors = useTranslations("auth.errors")

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(
    errorCode
      ? isKnownErrorCode(errorCode)
        ? tErrors(errorCode)
        : errorCode
      : null,
  )
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const result = await authClient.signIn.email({
        email,
        password,
        callbackURL: next,
      })
      if (result.error) {
        setError(result.error.message ?? tErrors("signInFailed"))
        setSubmitting(false)
        return
      }
      // twoFactor plugin signals via result.data.twoFactorRedirect
      const data = result.data as { twoFactorRedirect?: boolean } | null
      if (data?.twoFactorRedirect) {
        router.push(`/auth/mfa/verify?next=${encodeURIComponent(next)}`)
        return
      }
      router.push(next)
    } catch (err) {
      setError((err as Error).message ?? tErrors("signInFailed"))
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{t("email")}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">{t("password")}</Label>
              <a
                href="/auth/forgot-password"
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {t("forgotPassword")}
              </a>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={12}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? t("submitting") : t("submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
