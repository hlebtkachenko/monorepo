"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
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
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@workspace/ui/components/input-otp"
import { Label } from "@workspace/ui/components/label"

type Stage = "password" | "verify"

interface EnrollState {
  totpURI: string
  secret: string
}

export function MfaSetupForm() {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>("password")
  const [password, setPassword] = useState("")
  const [enroll, setEnroll] = useState<EnrollState | null>(null)
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmitPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const result = await authClient.twoFactor.enable({ password })
      if (result.error) {
        setError(result.error.message ?? "Could not start enrollment")
        setSubmitting(false)
        return
      }
      const totpURI = (result.data as { totpURI?: string } | null)?.totpURI
      if (!totpURI) {
        setError("Backend did not return a TOTP URI.")
        setSubmitting(false)
        return
      }
      const secret = extractSecret(totpURI)
      setEnroll({ totpURI, secret })
      setStage("verify")
    } catch (err) {
      setError((err as Error).message ?? "Could not start enrollment")
    } finally {
      setSubmitting(false)
    }
  }

  async function onSubmitVerify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (code.length !== 6) {
      setError("Enter the 6-digit code from your authenticator app.")
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const result = await authClient.twoFactor.verifyTotp({ code })
      if (result.error) {
        setError(result.error.message ?? "Invalid code")
        setSubmitting(false)
        return
      }
      router.push("/workspace/profile?mfa=enabled")
    } catch (err) {
      setError((err as Error).message ?? "Invalid code")
      setSubmitting(false)
    }
  }

  if (stage === "password") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Set up two-factor authentication</CardTitle>
          <CardDescription>
            Confirm your password to begin enrollment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmitPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Current password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
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
              {submitting ? "Starting…" : "Continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scan this in your authenticator app</CardTitle>
        <CardDescription>
          Use Google Authenticator, 1Password, Authy, or similar. After
          scanning, enter the 6-digit code below to confirm.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {enroll ? (
          <div className="mb-4 space-y-2">
            <Label>otpauth URI</Label>
            <code className="block rounded-md bg-muted p-3 text-xs break-all">
              {enroll.totpURI}
            </code>
            <Label>Secret (manual entry)</Label>
            <code className="block rounded-md bg-muted p-3 text-xs break-all">
              {enroll.secret}
            </code>
          </div>
        ) : null}
        <form onSubmit={onSubmitVerify} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="otp">6-digit code</Label>
            <InputOTP
              id="otp"
              maxLength={6}
              value={code}
              onChange={setCode}
              autoFocus
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            className="w-full"
            disabled={submitting || code.length !== 6}
          >
            {submitting ? "Verifying…" : "Confirm"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function extractSecret(totpURI: string): string {
  try {
    const url = new URL(totpURI)
    return url.searchParams.get("secret") ?? ""
  } catch {
    return ""
  }
}
