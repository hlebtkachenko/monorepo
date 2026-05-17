"use client"

import { useMemo, useState, useEffect, useCallback } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { useTranslations } from "@workspace/i18n/client"
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

import { AuthHeaderLinkOverride } from "../_components/auth-header-link"
import { requestPasswordResetAction } from "./actions"

const RESEND_COOLDOWN = 30

export function ForgotPasswordForm() {
  const t = useTranslations("auth.forgot")
  const tValidation = useTranslations("auth.validation")

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
    if (msg.startsWith("email.")) return tValidation(msg)
    return msg
  }

  async function onSubmit(values: ForgotPasswordInput) {
    setServerError(null)
    const result = await requestPasswordResetAction(values.email)
    if (result.ok) {
      setSentEmail(values.email)
      setResendCooldown(RESEND_COOLDOWN)
    }
  }

  const handleResend = useCallback(async () => {
    if (!sentEmail) return
    await requestPasswordResetAction(sentEmail)
    setResendCooldown(RESEND_COOLDOWN)
  }, [sentEmail])

  return (
    <div className="flex flex-col gap-8">
      <AuthHeaderLinkOverride
        href="/auth/login"
        label={t("backToLogin")}
        icon={headerIcon}
      />

      {sentEmail ? (
        <>
          <header className="flex flex-col gap-2">
            <Heading level={2} className="mt-0">
              {t("sent.title")}
            </Heading>
            <Text variant="muted">
              {t("sent.description", { email: sentEmail })}
            </Text>
          </header>

          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto self-start p-0 text-muted-foreground"
            disabled={resendCooldown > 0}
            onClick={handleResend}
          >
            {resendCooldown > 0
              ? t("sent.resendIn", { seconds: String(resendCooldown) })
              : t("sent.resend")}
          </Button>
        </>
      ) : (
        <>
          <header className="flex flex-col gap-2">
            <Heading level={2} className="mt-0">
              {t("title")}
            </Heading>
            <Text variant="muted">{t("description")}</Text>
          </header>

          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-5"
            noValidate
          >
            <FieldGroup>
              <Field
                data-invalid={form.formState.errors.email ? "true" : undefined}
              >
                <FieldLabel htmlFor="email">{t("label")}</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  inputSize="xl"
                  autoComplete="email"
                  autoFocus
                  placeholder={t("placeholder")}
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
              {form.formState.isSubmitting ? t("submitting") : t("submit")}
            </Button>
          </form>
        </>
      )}
    </div>
  )
}
