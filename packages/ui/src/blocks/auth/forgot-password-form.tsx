"use client"

import { useMemo, useState, useEffect, useCallback } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import {
  ForgotPasswordSchema,
  type ForgotPasswordInput,
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
import { ArrowLeft } from "@workspace/ui/lib/icons"

import { AuthHeaderLinkOverride } from "./auth-header-link"

const RESEND_COOLDOWN = 30

export interface ForgotPasswordFormMessages {
  title: string
  description: string
  label: string
  placeholder: string
  submit: string
  submitting: string
  backToLogin: string
  sentTitle: string
  sentDescription: (email: string) => string
  sentResend: string
  sentResendIn: (seconds: string) => string
  validationFor: (key: string) => string
}

interface Props {
  messages: ForgotPasswordFormMessages
  loginHref?: string
  onRequestPasswordReset: (
    email: string,
  ) => Promise<{ ok: boolean; error?: string }>
}

export function ForgotPasswordForm({
  messages,
  loginHref = "/auth/login",
  onRequestPasswordReset,
}: Props) {
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(ForgotPasswordSchema),
    defaultValues: { email: "" },
    mode: "onSubmit",
  })

  const [serverError, setServerError] = useState<string | null>(null)
  const [sentEmail, setSentEmail] = useState<string | null>(null)
  const [resendCooldown, setResendCooldown] = useState(0)

  useEffect(() => {
    if (resendCooldown <= 0) return
    const id = setTimeout(() => setResendCooldown((c) => c - 1), 1000)
    return () => clearTimeout(id)
  }, [resendCooldown])

  const headerIcon = useMemo(
    () => <ArrowLeft className="size-4" aria-hidden="true" />,
    [],
  )

  function translateValidation(msg: string | undefined): string | undefined {
    if (!msg) return undefined
    if (msg.startsWith("email.")) return messages.validationFor(msg)
    return msg
  }

  async function onSubmit(values: ForgotPasswordInput) {
    setServerError(null)
    const result = await onRequestPasswordReset(values.email)
    if (result.ok) {
      setSentEmail(values.email)
      setResendCooldown(RESEND_COOLDOWN)
    } else if (result.error) {
      setServerError(result.error)
    }
  }

  const handleResend = useCallback(async () => {
    if (!sentEmail) return
    await onRequestPasswordReset(sentEmail)
    setResendCooldown(RESEND_COOLDOWN)
  }, [sentEmail, onRequestPasswordReset])

  return (
    <div className="flex flex-col gap-8">
      <AuthHeaderLinkOverride
        href={loginHref}
        label={messages.backToLogin}
        icon={headerIcon}
      />

      {sentEmail ? (
        <>
          <header className="flex flex-col gap-2">
            <Heading level={2} className="mt-0">
              {messages.sentTitle}
            </Heading>
            <Text variant="muted">{messages.sentDescription(sentEmail)}</Text>
          </header>

          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto self-start p-0 text-muted-foreground"
            disabled={resendCooldown > 0}
            onClick={() => void handleResend()}
          >
            {resendCooldown > 0
              ? messages.sentResendIn(String(resendCooldown))
              : messages.sentResend}
          </Button>
        </>
      ) : (
        <>
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
              <Field
                data-invalid={form.formState.errors.email ? "true" : undefined}
              >
                <FieldLabel htmlFor="email">{messages.label}</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  inputSize="xl"
                  autoComplete="email"
                  autoFocus
                  placeholder={messages.placeholder}
                  {...form.register("email")}
                  aria-invalid={!!form.formState.errors.email}
                />
                {form.formState.errors.email && (
                  <FieldError>
                    {translateValidation(form.formState.errors.email.message)}
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
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting
                ? messages.submitting
                : messages.submit}
            </Button>
          </form>
        </>
      )}
    </div>
  )
}
