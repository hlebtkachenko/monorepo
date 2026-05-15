"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ChevronLeft } from "lucide-react"

import { authClient } from "@workspace/auth/client"
import { useTranslations } from "@workspace/i18n/client"
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
import { PasswordChecklist } from "@workspace/ui/components/password-checklist"
import { PasswordInput } from "@workspace/ui/components/password-input"

export function ResetPasswordForm() {
  const router = useRouter()
  const search = useSearchParams()
  const token = search.get("token") ?? ""

  const t = useTranslations("auth.reset")
  const tValidation = useTranslations("auth.validation")
  const tErrors = useTranslations("auth.errors")

  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(ResetPasswordSchema),
    defaultValues: { token, password: "", confirm: "" },
    mode: "onSubmit",
  })

  const [serverError, setServerError] = useState<string | null>(null)
  const password = form.watch("password")
  const confirm = form.watch("confirm")

  const checklistLabels = {
    length: tValidation("password.length"),
    number: tValidation("password.number"),
    symbol: tValidation("password.symbol"),
    mixedCase: tValidation("password.mixedCase"),
  } as const

  function translateMessage(msg: string | undefined): string | undefined {
    if (!msg) return undefined
    if (msg.startsWith("password.") || msg.startsWith("token.")) {
      return tValidation(msg)
    }
    return msg
  }

  async function onSubmit(values: ResetPasswordInput) {
    setServerError(null)
    try {
      const result = await authClient.resetPassword({
        token: values.token,
        newPassword: values.password,
      })
      if (result.error) {
        setServerError(result.error.message ?? tErrors("resetFailed"))
        return
      }
      router.push("/auth/login")
    } catch (err) {
      setServerError((err as Error).message ?? tErrors("resetFailed"))
    }
  }

  const invalidLink = !token
  if (invalidLink) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          href="/auth/login"
          className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {t("backToLogin")}
        </Link>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          {t("invalidLink.title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("invalidLink.description")}
        </p>
        <Link
          href="/auth/forgot-password"
          className="text-sm underline-offset-4 hover:text-foreground hover:underline"
        >
          {t("backToLogin")}
        </Link>
      </div>
    )
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
        <input type="hidden" {...form.register("token")} />
        <FieldGroup>
          <Field
            data-invalid={form.formState.errors.password ? "true" : undefined}
          >
            <FieldLabel htmlFor="password">{t("newPasswordLabel")}</FieldLabel>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              showGenerate
              autoFocus
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
              {t("confirmPasswordLabel")}
            </FieldLabel>
            <PasswordInput
              id="confirm"
              autoComplete="new-password"
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
          <p className="text-sm text-destructive" role="alert">
            {serverError}
          </p>
        )}

        <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? t("submitting") : t("submit")}
        </Button>
      </form>
    </div>
  )
}
