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
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { PasswordInput } from "@workspace/ui/components/password-input"

import { clearLoginEmailAction } from "../actions"

interface Props {
  email: string
}

export function LoginPasswordForm({ email }: Props) {
  const router = useRouter()
  const search = useSearchParams()
  const next = search.get("next") ?? "/workspace"

  const t = useTranslations("auth.login.password")
  const tEmailStep = useTranslations("auth.login.email")
  const tValidation = useTranslations("auth.validation")
  const tErrors = useTranslations("auth.errors")

  const form = useForm<LoginPasswordInput>({
    resolver: zodResolver(LoginPasswordSchema),
    defaultValues: { password: "", rememberMe: false },
    mode: "onSubmit",
  })

  const [serverError, setServerError] = useState<string | null>(null)

  function translateValidation(msg: string | undefined): string | undefined {
    if (!msg) return undefined
    if (msg.startsWith("password.")) return tValidation(msg)
    return msg
  }

  async function onSubmit(values: LoginPasswordInput) {
    setServerError(null)
    try {
      const result = await authClient.signIn.email({
        email,
        password: values.password,
        rememberMe: values.rememberMe,
        callbackURL: next,
      })
      if (result.error) {
        setServerError(result.error.message ?? tErrors("invalidCredentials"))
        return
      }
      const data = result.data as { twoFactorRedirect?: boolean } | null
      if (data?.twoFactorRedirect) {
        router.push(`/auth/login/mfa?next=${encodeURIComponent(next)}`)
        return
      }
      await clearLoginEmailAction()
      router.push(next)
    } catch (err) {
      setServerError((err as Error).message ?? tErrors("invalidCredentials"))
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <Link
        href="/auth/login"
        className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        {t("useDifferentEmail")}
      </Link>

      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("description", { email })}
        </p>
      </header>

      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-5"
        noValidate
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email-locked">
              {tEmailStep("label")}
            </FieldLabel>
            <Input
              id="email-locked"
              type="email"
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
              <span>{t("label")}</span>
              <Link
                href="/auth/forgot-password"
                className="text-sm font-normal text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {t("forgotPassword")}
              </Link>
            </FieldLabel>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              autoFocus
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
              {t("rememberMe")}
            </FieldLabel>
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
