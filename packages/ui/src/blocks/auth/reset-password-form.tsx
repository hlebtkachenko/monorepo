"use client"

import { useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import {
  ResetPasswordSchema,
  type ResetPasswordInput,
} from "@workspace/shared/auth"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Heading } from "@workspace/ui/components/heading"
import { PasswordChecklist } from "@workspace/ui/components/password-checklist"
import { PasswordInput } from "@workspace/ui/components/password-input"
import { Text } from "@workspace/ui/components/text"
import { ArrowLeft } from "@workspace/ui/lib/icons"

import { AuthHeaderLinkOverride } from "./auth-header-link"

export interface ResetPasswordFormMessages {
  title: string
  description: string
  newPasswordLabel: string
  confirmPasswordLabel: string
  submit: string
  submitting: string
  backToLogin: string
  invalidLinkTitle: string
  invalidLinkDescription: string
  invalidLinkRequestNew: string
  successTitle: string
  successDescription: string
  successSignIn: string
  resetFailed: string
  validationFor: (key: string) => string
}

interface Props {
  messages: ResetPasswordFormMessages
  token?: string
  loginHref?: string
  forgotHref?: string
  onResetPassword: (
    token: string,
    newPassword: string,
  ) => Promise<{ ok: boolean; error?: string }>
  onNavigate: (href: string) => void
}

export function ResetPasswordForm({
  messages,
  token = "",
  loginHref = "/auth/login",
  forgotHref = "/auth/forgot-password",
  onResetPassword,
  onNavigate,
}: Props) {
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(ResetPasswordSchema),
    defaultValues: { token, password: "", confirm: "" },
    mode: "onSubmit",
  })

  const [serverError, setServerError] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const [success, setSuccess] = useState(false)
  const password = form.watch("password")
  const confirm = form.watch("confirm")

  const checklistLabels = {
    length: messages.validationFor("password.length"),
    number: messages.validationFor("password.number"),
    symbol: messages.validationFor("password.symbol"),
    mixedCase: messages.validationFor("password.mixedCase"),
  } as const

  function translateMessage(msg: string | undefined): string | undefined {
    if (!msg) return undefined
    if (msg.startsWith("password.") || msg.startsWith("token.")) {
      return messages.validationFor(msg)
    }
    return msg
  }

  async function onSubmit(values: ResetPasswordInput) {
    setServerError(null)
    const result = await onResetPassword(values.token, values.password)
    if (result.ok) {
      setSuccess(true)
    } else {
      setServerError(result.error ?? messages.resetFailed)
    }
  }

  const headerIcon = useMemo(
    () => <ArrowLeft className="size-4" aria-hidden="true" />,
    [],
  )

  if (!token) {
    return (
      <div className="flex flex-col gap-8">
        <AuthHeaderLinkOverride
          href={loginHref}
          label={messages.backToLogin}
          icon={headerIcon}
        />
        <header className="flex flex-col gap-2">
          <Heading level={2} className="mt-0">
            {messages.invalidLinkTitle}
          </Heading>
          <Text variant="muted">{messages.invalidLinkDescription}</Text>
        </header>
        <a
          href={forgotHref}
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {messages.invalidLinkRequestNew}
        </a>
      </div>
    )
  }

  if (success) {
    return (
      <div className="flex flex-col gap-8">
        <AuthHeaderLinkOverride
          href={loginHref}
          label={messages.backToLogin}
          icon={headerIcon}
        />
        <header className="flex flex-col gap-2">
          <Heading level={2} className="mt-0">
            {messages.successTitle}
          </Heading>
          <Text variant="muted">{messages.successDescription}</Text>
        </header>
        <Button size="xl" onClick={() => onNavigate(loginHref)}>
          {messages.successSignIn}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <AuthHeaderLinkOverride
        href={loginHref}
        label={messages.backToLogin}
        icon={headerIcon}
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
        autoComplete="on"
      >
        <input type="hidden" {...form.register("token")} />
        <FieldGroup>
          <Field
            data-invalid={form.formState.errors.password ? "true" : undefined}
          >
            <FieldLabel htmlFor="password">
              {messages.newPasswordLabel}
            </FieldLabel>
            <PasswordInput
              id="password"
              inputSize="xl"
              autoComplete="new-password"
              showGenerate
              autoFocus
              visible={visible}
              onVisibleChange={setVisible}
              value={password}
              onValueChange={(v) =>
                form.setValue("password", v, { shouldValidate: false })
              }
              onGenerate={(pw) => {
                form.setValue("confirm", pw, { shouldValidate: false })
              }}
            />
            {form.formState.errors.password && (
              <FieldError>
                {translateMessage(form.formState.errors.password.message)}
              </FieldError>
            )}
          </Field>

          <PasswordChecklist value={password} labels={checklistLabels} />

          <Field
            data-invalid={form.formState.errors.confirm ? "true" : undefined}
          >
            <FieldLabel htmlFor="confirm">
              {messages.confirmPasswordLabel}
            </FieldLabel>
            <PasswordInput
              id="confirm"
              inputSize="xl"
              autoComplete="new-password"
              visible={visible}
              onVisibleChange={setVisible}
              value={confirm}
              onValueChange={(v) =>
                form.setValue("confirm", v, { shouldValidate: false })
              }
            />
            {form.formState.errors.confirm && (
              <FieldError>
                {translateMessage(form.formState.errors.confirm.message)}
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
    </div>
  )
}
