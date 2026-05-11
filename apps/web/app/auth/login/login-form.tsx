"use client"

import { useState, type FormEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { authClient } from "@workspace/auth/client"
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

const ERROR_MESSAGES: Record<string, string> = {
  "no-workspace-access":
    "You are signed in but no workspace is linked to this account. Ask support for an invitation.",
  "signup-session-expired":
    "Your signup link expired. Ask support for a new invitation.",
  "invite-session-expired":
    "Your invite link expired. Ask the inviter to resend it.",
  "missing-signup-token": "The signup link is missing its token.",
  "missing-invite-token": "The invite link is missing its token.",
  expired: "Your link has expired. Request a new one.",
  invalid: "Your link is invalid or has been tampered with.",
  wrong_kind: "Your link is the wrong type for this flow.",
  disabled: "This flow is currently disabled. Contact support.",
}

export function LoginForm() {
  const router = useRouter()
  const search = useSearchParams()
  const next = search.get("next") ?? "/workspace"
  const errorCode = search.get("error")

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(
    errorCode ? (ERROR_MESSAGES[errorCode] ?? errorCode) : null,
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
        setError(result.error.message ?? "Sign-in failed")
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
      setError((err as Error).message ?? "Sign-in failed")
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          Use your email and password to access your workspace.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
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
              <Label htmlFor="password">Password</Label>
              <a
                href="/auth/forgot-password"
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Forgot password?
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
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
