"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { OTPSchema, type OTPInput } from "@workspace/shared/auth"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Heading } from "@workspace/ui/components/heading"
import { Input } from "@workspace/ui/components/input"
import {
  INPUT_OTP_PATTERNS,
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@workspace/ui/components/input-otp"
import { Text } from "@workspace/ui/components/text"

export interface LoginMfaFormMessages {
  title: string
  description: (email: string) => string
  label: string
  submit: string
  submitting: string
  useRecoveryCode: string
  recoveryTitle: string
  recoveryDescription: (email: string) => string
  recoveryLabel: string
  recoveryPlaceholder: string
  useAuthenticator: string
  invalidCode: string
  validationFor: (key: string) => string
}

interface Props {
  email: string
  messages: LoginMfaFormMessages
  defaultNext: string
  next?: string
  afterSignInGate?: () => Promise<boolean>
  onVerifyTotp: (code: string) => Promise<{
    error?: { message?: string } | null
    data?: unknown
  }>
  onVerifyBackupCode: (code: string) => Promise<{
    error?: { message?: string } | null
    data?: unknown
  }>
  onClearLoginEmail: () => Promise<void>
  onSignOut?: () => Promise<void>
  onNavigate: (href: string) => void
}

type Mode = "totp" | "recovery"

export function LoginMfaForm({
  email,
  messages,
  defaultNext,
  next: nextProp,
  afterSignInGate,
  onVerifyTotp,
  onVerifyBackupCode,
  onClearLoginEmail,
  onSignOut,
  onNavigate,
}: Props) {
  const next = sanitizeNext(nextProp, defaultNext)

  const [mode, setMode] = useState<Mode>("totp")
  const [serverError, setServerError] = useState<string | null>(null)

  const totpForm = useForm<OTPInput>({
    resolver: zodResolver(OTPSchema),
    defaultValues: { code: "" },
    mode: "onSubmit",
  })

  const [recoveryCode, setRecoveryCode] = useState("")
  const [recoverySubmitting, setRecoverySubmitting] = useState(false)

  function translateOtpValidation(msg: string | undefined): string | undefined {
    if (!msg) return undefined
    if (msg.startsWith("otp.")) return messages.validationFor(msg)
    return msg
  }

  async function gateAndNavigate(): Promise<boolean> {
    if (!afterSignInGate) return true
    const allowed = await afterSignInGate()
    if (!allowed) {
      if (onSignOut) await onSignOut()
      setServerError(messages.invalidCode)
      return false
    }
    return true
  }

  async function onSubmitTotp(values: OTPInput) {
    setServerError(null)
    try {
      const result = await onVerifyTotp(values.code)
      if (result.error) {
        setServerError(result.error.message ?? messages.invalidCode)
        return
      }
      if (!(await gateAndNavigate())) return
      await onClearLoginEmail()
      onNavigate(next)
    } catch (err) {
      if (isNextRedirectError(err)) throw err
      setServerError((err as Error).message ?? messages.invalidCode)
    }
  }

  async function onSubmitRecovery(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setServerError(null)
    setRecoverySubmitting(true)
    try {
      const result = await onVerifyBackupCode(recoveryCode.trim())
      if (result.error) {
        setServerError(result.error.message ?? messages.invalidCode)
        setRecoverySubmitting(false)
        return
      }
      if (!(await gateAndNavigate())) {
        setRecoverySubmitting(false)
        return
      }
      await onClearLoginEmail()
      onNavigate(next)
    } catch (err) {
      if (isNextRedirectError(err)) throw err
      setServerError((err as Error).message ?? messages.invalidCode)
      setRecoverySubmitting(false)
    }
  }

  function isNextRedirectError(err: unknown): boolean {
    return (
      typeof err === "object" &&
      err !== null &&
      "digest" in err &&
      typeof (err as { digest?: unknown }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    )
  }

  const code = totpForm.watch("code")

  if (mode === "recovery") {
    return (
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <Heading level={2} className="mt-0">
            {messages.recoveryTitle}
          </Heading>
          <Text variant="muted">{messages.recoveryDescription(email)}</Text>
        </header>

        <form
          onSubmit={(e) => void onSubmitRecovery(e)}
          className="flex flex-col gap-5"
          noValidate
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="recovery-code">
                {messages.recoveryLabel}
              </FieldLabel>
              <Input
                id="recovery-code"
                type="text"
                inputSize="xl"
                autoComplete="one-time-code"
                autoFocus
                maxLength={11}
                placeholder={messages.recoveryPlaceholder}
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
              />
            </Field>
          </FieldGroup>

          {serverError && (
            <Text variant="small" className="text-destructive" role="alert">
              {serverError}
            </Text>
          )}

          <Button
            type="submit"
            size="xl"
            disabled={recoverySubmitting || recoveryCode.trim().length === 0}
          >
            {recoverySubmitting ? messages.submitting : messages.submit}
          </Button>

          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto self-start p-0 text-muted-foreground"
            onClick={() => {
              setMode("totp")
              setServerError(null)
            }}
          >
            {messages.useAuthenticator}
          </Button>
        </form>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Heading level={2} className="mt-0">
          {messages.title}
        </Heading>
        <Text variant="muted">{messages.description(email)}</Text>
      </header>

      <form
        onSubmit={(e) => void totpForm.handleSubmit(onSubmitTotp)(e)}
        className="flex flex-col gap-5"
        noValidate
      >
        <FieldGroup>
          <Field
            data-invalid={totpForm.formState.errors.code ? "true" : undefined}
          >
            <FieldLabel htmlFor="otp">{messages.label}</FieldLabel>
            <InputOTP
              id="otp"
              maxLength={6}
              pattern={INPUT_OTP_PATTERNS.numeric}
              inputMode="numeric"
              value={code}
              onChange={(v) =>
                totpForm.setValue("code", v, { shouldValidate: false })
              }
              containerClassName="w-full"
              autoFocus
            >
              <InputOTPGroup size="xl">
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
            {totpForm.formState.errors.code && (
              <FieldError>
                {translateOtpValidation(totpForm.formState.errors.code.message)}
              </FieldError>
            )}
          </Field>
        </FieldGroup>

        {serverError && (
          <Text variant="small" className="text-destructive" role="alert">
            {serverError}
          </Text>
        )}

        <Button
          type="submit"
          size="xl"
          disabled={totpForm.formState.isSubmitting || code.length !== 6}
        >
          {totpForm.formState.isSubmitting
            ? messages.submitting
            : messages.submit}
        </Button>

        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto self-start p-0 text-muted-foreground"
          onClick={() => {
            setMode("recovery")
            setServerError(null)
          }}
        >
          {messages.useRecoveryCode}
        </Button>
      </form>
    </div>
  )
}

function sanitizeNext(
  raw: string | null | undefined,
  fallback: string,
): string {
  if (!raw) return fallback
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return fallback
  }
  if (/^\/[A-Za-z][A-Za-z0-9+.-]*:/.test(raw)) {
    return fallback
  }
  return raw
}
