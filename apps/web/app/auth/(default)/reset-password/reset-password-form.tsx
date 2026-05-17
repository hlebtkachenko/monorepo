"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

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
import { Heading } from "@workspace/ui/components/heading"
import { PasswordChecklist } from "@workspace/ui/components/password-checklist"
import { PasswordInput } from "@workspace/ui/components/password-input"
import { Text } from "@workspace/ui/components/text"
import { ArrowLeft } from "@workspace/ui/lib/icons"

import { AuthHeaderLinkOverride } from "../_components/auth-header-link"
import { resetPasswordAction } from "./actions"

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
  const [visible, setVisible] = useState(false)
  const [success, setSuccess] = useState(false)
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
    const result = await resetPasswordAction(values.token, values.password)
    if (result.ok) {
      setSuccess(true)
    } else {
      setServerError(result.error ?? tErrors("resetFailed"))
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
          href="/auth/login"
          label={t("backToLogin")}
          icon={headerIcon}
        />
        <header className="flex flex-col gap-2">
          <Heading level={2} className="mt-0">
            {t("invalidLink.title")}
          </Heading>
          <Text variant="muted">{t("invalidLink.description")}</Text>
        </header>
        <Link
          href="/auth/forgot-password"
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {t("invalidLink.requestNew")}
        </Link>
      </div>
    )
  }

  if (success) {
    return (
      <div className="flex flex-col gap-8">
        <AuthHeaderLinkOverride
          href="/auth/login"
          label={t("backToLogin")}
          icon={headerIcon}
        />
        <header className="flex flex-col gap-2">
          <Heading level={2} className="mt-0">
            {t("success.title")}
          </Heading>
          <Text variant="muted">{t("success.description")}</Text>
        </header>
        <Button size="xl" asChild>
          <Link href="/auth/login">{t("success.signIn")}</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <AuthHeaderLinkOverride
        href="/auth/login"
        label={t("backToLogin")}
        icon={headerIcon}
      />

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
        autoComplete="on"
      >
        <input type="hidden" {...form.register("token")} />
        <FieldGroup>
          <Field
            data-invalid={form.formState.errors.password ? "true" : undefined}
          >
            <FieldLabel htmlFor="password">{t("newPasswordLabel")}</FieldLabel>
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
              {t("confirmPasswordLabel")}
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
          {form.formState.isSubmitting ? t("submitting") : t("submit")}
        </Button>
      </form>
    </div>
  )
}
