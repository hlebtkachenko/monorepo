"use client"

import { useState } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ChevronLeft } from "lucide-react"

import { authClient } from "@workspace/auth/client"
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
import { Input } from "@workspace/ui/components/input"

export function ForgotPasswordForm() {
  const t = useTranslations("auth.forgot")
  const tValidation = useTranslations("auth.validation")
  const tErrors = useTranslations("auth.errors")

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(ForgotPasswordSchema),
    defaultValues: { email: "" },
    mode: "onSubmit",
  })

  const [serverError, setServerError] = useState<string | null>(null)
  const [sentEmail, setSentEmail] = useState<string | null>(null)

  function translateValidation(msg: string | undefined): string | undefined {
    if (!msg) return undefined
    if (msg.startsWith("email.")) return tValidation(msg)
    return msg
  }

  async function onSubmit(values: ForgotPasswordInput) {
    setServerError(null)
    try {
      const result = await authClient.requestPasswordReset({
        email: values.email,
        redirectTo: "/auth/reset-password",
      })
      if (result.error) {
        setServerError(result.error.message ?? tErrors("couldNotSendReset"))
        return
      }
      setSentEmail(values.email)
    } catch (err) {
      setServerError((err as Error).message ?? tErrors("couldNotSendReset"))
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <Link
        href="/auth/login"
        className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        {t("backToLogin")}
      </Link>

      {sentEmail ? (
        <header className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            {t("sent.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("sent.description", { email: sentEmail })}
          </p>
        </header>
      ) : (
        <>
          <header className="flex flex-col gap-2">
            <h1 className="font-heading text-3xl font-semibold tracking-tight">
              {t("title")}
            </h1>
            <p className="text-sm text-muted-foreground">{t("description")}</p>
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
              <p className="text-sm text-destructive" role="alert">
                {serverError}
              </p>
            )}

            <Button
              type="submit"
              size="lg"
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
