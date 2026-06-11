"use client"

import { useState, type ReactNode } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { LoginEmailSchema, type LoginEmailInput } from "@workspace/shared/auth"
import { BRAND_SALES_EMAIL } from "@workspace/ui/brand-assets"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@workspace/ui/components/field"
import { Heading } from "@workspace/ui/components/heading"
import { Input } from "@workspace/ui/components/input"
import { Text } from "@workspace/ui/components/text"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { ArrowUpRight, KeyRound } from "@workspace/ui/lib/icons"

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
  "loginSessionExpired",
] as const

type KnownErrorCode = (typeof KNOWN_ERROR_CODES)[number]

function isKnownErrorCode(code: string): code is KnownErrorCode {
  return (KNOWN_ERROR_CODES as readonly string[]).includes(code)
}

export interface LoginEmailFormMessages {
  title: ReactNode
  description: string
  label: string
  placeholder: string
  submit: string
  submitting: string
  divider?: string
  ssoLabel?: string
  ssoTooltip?: string
  contactSalesPrompt?: string
  contactSalesCta?: string
  errorFor: (code: KnownErrorCode) => string
  validationFor: (key: string) => string
  signInFailed: string
}

interface Props {
  messages: LoginEmailFormMessages
  defaultNext: string
  next?: string
  initialErrorCode?: string | null
  passwordHref?: string
  showSso?: boolean
  showContactSales?: boolean
  onSubmitEmail: (input: {
    email: string
  }) => Promise<{ ok: boolean; errorKey?: string }>
  onNavigate: (href: string) => void
}

export function LoginEmailForm({
  messages,
  defaultNext,
  next: nextProp,
  initialErrorCode,
  passwordHref = "/auth/login/password",
  showSso = false,
  showContactSales = false,
  onSubmitEmail,
  onNavigate,
}: Props) {
  const next = sanitizeNext(nextProp, defaultNext)

  const form = useForm<LoginEmailInput>({
    resolver: zodResolver(LoginEmailSchema),
    defaultValues: { email: "" },
    mode: "onSubmit",
  })

  const [serverError, setServerError] = useState<string | null>(
    initialErrorCode && isKnownErrorCode(initialErrorCode)
      ? messages.errorFor(initialErrorCode)
      : null,
  )

  function translateValidation(
    message: string | undefined,
  ): string | undefined {
    if (!message) return undefined
    if (message.startsWith("email.")) {
      return messages.validationFor(message)
    }
    return message
  }

  async function onSubmit(values: LoginEmailInput) {
    setServerError(null)
    const result = await onSubmitEmail({ email: values.email })
    if (!result.ok) {
      const translated =
        result.errorKey && result.errorKey.startsWith("email.")
          ? messages.validationFor(result.errorKey)
          : (result.errorKey ?? messages.signInFailed)
      setServerError(translated)
      return
    }
    const nextHref =
      passwordHref +
      (next !== defaultNext ? `?next=${encodeURIComponent(next)}` : "")
    onNavigate(nextHref)
  }

  return (
    <div className="flex flex-col gap-8">
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

        <Button type="submit" size="xl" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? messages.submitting : messages.submit}
        </Button>
      </form>

      {showSso &&
        messages.divider &&
        messages.ssoLabel &&
        messages.ssoTooltip && (
          <>
            <FieldSeparator>{messages.divider}</FieldSeparator>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0} className="inline-block">
                    <Button
                      type="button"
                      variant="outline"
                      size="xl"
                      className="w-full"
                      disabled
                      aria-disabled="true"
                    >
                      <KeyRound className="size-4" aria-hidden="true" />
                      {messages.ssoLabel}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{messages.ssoTooltip}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </>
        )}

      {showContactSales &&
        messages.contactSalesPrompt &&
        messages.contactSalesCta && (
          <Text variant="muted">
            {messages.contactSalesPrompt}{" "}
            <a
              href={`mailto:${BRAND_SALES_EMAIL}`}
              className="inline-flex items-center gap-0.5 font-medium text-foreground underline-offset-4 hover:underline"
            >
              {messages.contactSalesCta}
              <ArrowUpRight className="size-3" aria-hidden="true" />
            </a>
          </Text>
        )}
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
