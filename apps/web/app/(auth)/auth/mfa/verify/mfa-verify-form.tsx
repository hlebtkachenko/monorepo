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
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@workspace/ui/components/input-otp"
import { Label } from "@workspace/ui/components/label"

export function MfaVerifyForm() {
  const router = useRouter()
  const search = useSearchParams()
  const next = search.get("next") ?? "/workspace"

  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
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
      router.push(next)
    } catch (err) {
      setError((err as Error).message ?? "Invalid code")
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Two-factor verification</CardTitle>
        <CardDescription>
          Enter the 6-digit code from your authenticator app.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="otp">Authentication code</Label>
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
            {submitting ? "Verifying…" : "Verify"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
