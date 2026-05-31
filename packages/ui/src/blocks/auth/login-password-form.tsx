"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import {
  LoginPasswordSchema,
  type LoginPasswordInput,
} from "@workspace/shared/auth"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@workspace/ui/components/field"
import { Heading } from "@workspace/ui/components/heading"
import { Input } from "@workspace/ui/components/input"
import { PasswordInput } from "@workspace/ui/components/password-input"
import { Text } from "@workspace/ui/components/text"
import { ArrowLeft, Mail } from "@workspace/ui/lib/icons"

import { AuthHeaderLinkOverride } from "./auth-header-link"

const RESEND_COOLDOWN = 30

export interface LoginPasswordFormMessages {
  title: string
  description: string
  label: string
  forgot: string
  rememberMe: string
  submit: string
  submitting: string
  emailMeLink: string
  useDifferentEmail: string
  magicLinkSentTitle: string
  magicLinkSentDescription: (email: string) => string
  magicLinkResend: string
  magicLinkResendIn: (seconds: string) => string
  invalidCredentials: string
  signInFailed: string
  validationFor: (key: string) => string
}

interface Props {
  email: string
  messages: LoginPasswordFormMessages
  defaultNext: string
  next?: string
  loginHref?: string
  forgotHref?: string
  mfaHref?: string
  afterSignInGate?: () => Promise<boolean>
  onSignIn: (opts: {
    email: string
    password: string
    rememberMe: boolean
    callbackURL?: string
  }) => Promise<{
    error?: { message?: string } | null
    data?: { twoFactorRedirect?: boolean } | null
  }>
  onClearLoginEmail: () => Promise<void>
  onSendMagicLink: (
    email: string,
    callbackURL: string,
  ) => Promise<{ ok: boolean; error?: string }>
  onSignOut?: () => Promise<void>
  onNavigate: (href: string) => void
  /**
   * When true, the block skips its own `onClearLoginEmail` + `onNavigate(next)`
   * on a non-2FA success. Use this when `onSignIn` is a Server Action that
   * calls `redirect()` itself: the framework navigates atomically with the
   * session cookie write, so a follow-up `router.push` would race it. The
   * 2FA branch is unaffected: the form still routes to `mfaHref`.
   */
  noopOnSuccess?: boolean
}

export function LoginPasswordForm({
  email,
  messages,
  defaultNext,
  next: nextProp,
  loginHref = "/auth/login",
  forgotHref = "/auth/forgot-password",
  mfaHref = "/auth/login/mfa",
  afterSignInGate,
  onSignIn,
  onClearLoginEmail,
  onSendMagicLink,
  onSignOut,
  onNavigate,
  noopOnSuccess = false,
}: Props) {
  const next = sanitizeNext(nextProp, defaultNext)

  const form = useForm<LoginPasswordInput>({
    resolver: zodResolver(LoginPasswordSchema),
    defaultValues: { password: "", rememberMe: false },
    mode: "onSubmit",
  })

  const [serverError, setServerError] = useState<string | null>(null)
  const [magicLinkSending, setMagicLinkSending] = useState(false)
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)

  useEffect(() => {
    if (resendCooldown <= 0) return
    const id = setTimeout(() => setResendCooldown((c) => c - 1), 1000)
    return () => clearTimeout(id)
  }, [resendCooldown])

  const sendMagicLink = useCallback(async () => {
    setMagicLinkSending(true)
    setServerError(null)
    const result = await onSendMagicLink(email, next)
    if (result.ok) {
      setMagicLinkSent(true)
      setResendCooldown(RESEND_COOLDOWN)
    } else {
      setServerError(result.error ?? messages.signInFailed)
    }
    setMagicLinkSending(false)
  }, [email, next, onSendMagicLink, messages.signInFailed])

  function translateValidation(msg: string | undefined): string | undefined {
    if (!msg) return undefined
    if (msg.startsWith("password.")) return messages.validationFor(msg)
    return msg
  }

  async function onSubmit(values: LoginPasswordInput) {
    setServerError(null)
    try {
      const signInOpts: Parameters<typeof onSignIn>[0] = {
        email,
        password: values.password,
        rememberMe: values.rememberMe,
      }
      // When there is a post-sign-in gate (admin allowlist), do NOT pass
      // callbackURL so the browser doesn't race ahead of the gate check.
      // Same applies when `onSignIn` is a Server Action that handles
      // navigation itself via `redirect()`: the action ignores callbackURL.
      if (!afterSignInGate && !noopOnSuccess) {
        signInOpts.callbackURL = next
      }
      const result = await onSignIn(signInOpts)
      if (result.error) {
        setServerError(result.error.message ?? messages.invalidCredentials)
        return
      }
      const data = result.data as { twoFactorRedirect?: boolean } | null
      if (data?.twoFactorRedirect) {
        onNavigate(`${mfaHref}?next=${encodeURIComponent(next)}`)
        return
      }
      if (afterSignInGate) {
        const allowed = await afterSignInGate()
        if (!allowed) {
          if (onSignOut) await onSignOut()
          setServerError(messages.invalidCredentials)
          return
        }
      }
      // `noopOnSuccess` means `onSignIn` is a Server Action that already
      // called `redirect()`: the framework has navigated the browser
      // atomically with the session cookie write. Skip our own clear +
      // router.push to avoid racing the framework's NEXT_REDIRECT response.
      if (noopOnSuccess) return
      await onClearLoginEmail()
      onNavigate(next)
    } catch (err) {
      // A server-action `redirect()` throws an error whose `digest` starts
      // with "NEXT_REDIRECT"; the framework must see it to navigate. If we
      // swallow it the page silently stays on /auth/login and the message
      // ("NEXT_REDIRECT;…") leaks into the form as a fake error. Re-throw.
      if (isNextRedirectError(err)) throw err
      setServerError((err as Error).message ?? messages.invalidCredentials)
    }
  }

  const backIcon = useMemo(
    () => <ArrowLeft className="size-4" aria-hidden="true" />,
    [],
  )

  if (magicLinkSent) {
    return (
      <div className="flex flex-col gap-8">
        <AuthHeaderLinkOverride
          href={loginHref}
          label={messages.useDifferentEmail}
          icon={backIcon}
        />
        <header className="flex flex-col gap-2">
          <Heading level={2} className="mt-0">
            {messages.magicLinkSentTitle}
          </Heading>
          <Text variant="muted">
            {messages.magicLinkSentDescription(email)}
          </Text>
        </header>

        {serverError && (
          <Text variant="small" className="text-destructive" role="alert">
            {serverError}
          </Text>
        )}

        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto self-start p-0 text-muted-foreground"
          disabled={resendCooldown > 0 || magicLinkSending}
          onClick={() => void sendMagicLink()}
        >
          {resendCooldown > 0
            ? messages.magicLinkResendIn(String(resendCooldown))
            : messages.magicLinkResend}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <AuthHeaderLinkOverride
        href={loginHref}
        label={messages.useDifferentEmail}
        icon={backIcon}
      />
      <header className="flex flex-col gap-2">
        <Heading level={2} className="mt-0">
          {messages.title}
        </Heading>
        <Text variant="muted">{messages.description}</Text>
      </header>

      <form
        onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
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

          <Field
            data-invalid={form.formState.errors.password ? "true" : undefined}
          >
            <FieldLabel htmlFor="password" className="flex justify-between">
              <span>{messages.label}</span>
              <a
                href={forgotHref}
                className="text-sm font-normal text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {messages.forgot}
              </a>
            </FieldLabel>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              autoFocus
              inputSize="xl"
              value={form.watch("password")}
              onValueChange={(v) =>
                form.setValue("password", v, { shouldValidate: false })
              }
            />
            {form.formState.errors.password && (
              <FieldError>
                {translateValidation(form.formState.errors.password.message)}
              </FieldError>
            )}
          </Field>

          <Field orientation="horizontal">
            <Checkbox
              id="rememberMe"
              checked={form.watch("rememberMe")}
              onCheckedChange={(checked) =>
                form.setValue("rememberMe", checked === true)
              }
            />
            <FieldLabel htmlFor="rememberMe" className="font-normal">
              {messages.rememberMe}
            </FieldLabel>
          </Field>
        </FieldGroup>

        {serverError && (
          <Text variant="small" className="text-destructive" role="alert">
            {serverError}
          </Text>
        )}

        <Button type="submit" size="xl" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? messages.submitting : messages.submit}
        </Button>
      </form>

      <FieldSeparator>or</FieldSeparator>

      <Button
        type="button"
        variant="outline"
        size="xl"
        className="w-full"
        disabled={magicLinkSending}
        onClick={() => void sendMagicLink()}
      >
        <Mail className="size-4" aria-hidden="true" />
        {magicLinkSending ? messages.submitting : messages.emailMeLink}
      </Button>
    </div>
  )
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
