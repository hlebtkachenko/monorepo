"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import { authClient } from "@workspace/auth/client"
import {
  LoginEmailSchema,
  OTPSchema,
  type OTPInput,
} from "@workspace/shared/auth"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Heading } from "@workspace/ui/components/heading"
import { Input } from "@workspace/ui/components/input"
import { Text } from "@workspace/ui/components/text"

import { authMessage } from "../messages"

const CredentialsSchema = LoginEmailSchema.extend({
  password: z.string().min(1, { error: "password.required" }),
})
type CredentialsInput = z.infer<typeof CredentialsSchema>

/**
 * Minimal admin login: email + password, with a 2FA-code step shown when
 * Better Auth reports the account has two-factor enabled. On success the
 * browser navigates to `/`, where the `(gated)` layout runs the workspace
 * allowlist check.
 */
export function LoginForm() {
  const router = useRouter()
  const [step, setStep] = useState<"credentials" | "twoFactor">("credentials")
  const [serverError, setServerError] = useState<string | null>(null)

  const credentialsForm = useForm<CredentialsInput>({
    resolver: zodResolver(CredentialsSchema),
    defaultValues: { email: "", password: "" },
    mode: "onSubmit",
  })

  const otpForm = useForm<OTPInput>({
    resolver: zodResolver(OTPSchema),
    defaultValues: { code: "" },
    mode: "onSubmit",
  })

  async function onSubmitCredentials(values: CredentialsInput) {
    setServerError(null)
    const res = await authClient.signIn.email({
      email: values.email,
      password: values.password,
      rememberMe: true,
    })
    if (res.error) {
      setServerError(res.error.message ?? "Sign-in failed")
      return
    }
    const data = res.data as { twoFactorRedirect?: boolean } | null
    if (data?.twoFactorRedirect) {
      setStep("twoFactor")
      return
    }
    router.push("/")
    router.refresh()
  }

  async function onSubmitOtp(values: OTPInput) {
    setServerError(null)
    const res = await authClient.twoFactor.verifyTotp({ code: values.code })
    if (res.error) {
      setServerError(res.error.message ?? "Invalid code")
      return
    }
    router.push("/")
    router.refresh()
  }

  if (step === "twoFactor") {
    return (
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <Heading level={2} className="mt-0">
            Two-factor code
          </Heading>
          <Text variant="muted">
            Enter the 6-digit code from your authenticator app.
          </Text>
        </header>
        <form
          onSubmit={otpForm.handleSubmit(onSubmitOtp)}
          className="flex flex-col gap-5"
          noValidate
        >
          <FieldGroup>
            <Field
              data-invalid={otpForm.formState.errors.code ? "true" : undefined}
            >
              <FieldLabel htmlFor="code">Authentication code</FieldLabel>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                autoFocus
                placeholder="000000"
                {...otpForm.register("code")}
                aria-invalid={!!otpForm.formState.errors.code}
              />
              {otpForm.formState.errors.code && (
                <FieldError>
                  {authMessage(otpForm.formState.errors.code.message)}
                </FieldError>
              )}
            </Field>
          </FieldGroup>
          {serverError && (
            <Text variant="small" className="text-destructive" role="alert">
              {serverError}
            </Text>
          )}
          <Button type="submit" disabled={otpForm.formState.isSubmitting}>
            {otpForm.formState.isSubmitting ? "Verifying…" : "Verify"}
          </Button>
        </form>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Heading level={2} className="mt-0">
          Admin sign in
        </Heading>
        <Text variant="muted">Staff access to the Afframe admin surface.</Text>
      </header>
      <form
        onSubmit={credentialsForm.handleSubmit(onSubmitCredentials)}
        className="flex flex-col gap-5"
        noValidate
      >
        <FieldGroup>
          <Field
            data-invalid={
              credentialsForm.formState.errors.email ? "true" : undefined
            }
          >
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              {...credentialsForm.register("email")}
              aria-invalid={!!credentialsForm.formState.errors.email}
            />
            {credentialsForm.formState.errors.email && (
              <FieldError>
                {authMessage(credentialsForm.formState.errors.email.message)}
              </FieldError>
            )}
          </Field>
          <Field
            data-invalid={
              credentialsForm.formState.errors.password ? "true" : undefined
            }
          >
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              {...credentialsForm.register("password")}
              aria-invalid={!!credentialsForm.formState.errors.password}
            />
            {credentialsForm.formState.errors.password && (
              <FieldError>
                {authMessage(credentialsForm.formState.errors.password.message)}
              </FieldError>
            )}
          </Field>
        </FieldGroup>
        {serverError && (
          <Text variant="small" className="text-destructive" role="alert">
            {serverError}
          </Text>
        )}
        <Button type="submit" disabled={credentialsForm.formState.isSubmitting}>
          {credentialsForm.formState.isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <Text variant="small" className="text-muted-foreground">
        <Link href="/auth/forgot-password" className="underline">
          Forgot password?
        </Link>
      </Text>
    </div>
  )
}
