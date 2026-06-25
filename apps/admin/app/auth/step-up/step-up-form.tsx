"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@workspace/ui/components/button"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Heading } from "@workspace/ui/components/heading"
import { PasswordInput } from "@workspace/ui/components/password-input"
import { Text } from "@workspace/ui/components/text"
import { Input } from "@workspace/ui/components/input"

import type { StepUpLevel } from "@/lib/capabilities"

import { verifyStepUpAction } from "./actions"

interface Props {
  level: StepUpLevel
  next: string
  email: string
}

export function StepUpForm({ level, next, email }: Props) {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const r = await verifyStepUpAction({ password, code, level, next })
      if (!r.ok) {
        setError(r.error ?? "Verification failed")
        setSubmitting(false)
      }
      // On ok, the server action calls redirect(next); the client never
      // resumes here. The framework navigates atomically.
    } catch (err) {
      if (
        err &&
        typeof err === "object" &&
        "digest" in err &&
        typeof (err as { digest?: unknown }).digest === "string" &&
        (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
      ) {
        throw err
      }
      setError((err as Error).message ?? "Verification failed")
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Heading level={2} className="mt-0">
          Confirm your identity
        </Heading>
        <Text variant="muted">
          This section requires a fresh check. Re-enter your password
          {level === "twofa" ? " and your two-factor code" : ""} to continue.
        </Text>
      </header>

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="flex flex-col gap-5"
        noValidate
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email-locked">Email</FieldLabel>
            <Input
              id="email-locked"
              type="email"
              inputSize="xl"
              value={email}
              readOnly
              disabled
              autoComplete="username"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              autoFocus
              inputSize="xl"
              value={password}
              onValueChange={setPassword}
            />
          </Field>

          {level === "twofa" ? (
            <Field>
              <FieldLabel htmlFor="code">Two-factor code</FieldLabel>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                inputSize="xl"
                maxLength={8}
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 8))
                }
              />
            </Field>
          ) : null}
        </FieldGroup>

        {error ? (
          <Text variant="small" className="text-destructive" role="alert">
            {error}
          </Text>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={() => router.back()}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" size="xl" disabled={submitting}>
            {submitting ? "Verifying…" : "Continue"}
          </Button>
        </div>
      </form>
    </div>
  )
}
