"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { useTranslations } from "@workspace/i18n/client"
import {
  OnboardingPasswordSchema,
  type OnboardingPasswordInput,
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

import { submitMemberPasswordAction } from "../actions"

interface Props {
  email: string
}

export function MemberPasswordForm({ email }: Props) {
  const router = useRouter()
  const t = useTranslations("onboarding.password")
  const tValidation = useTranslations("auth.validation")
  const tErrors = useTranslations("onboarding.errors")

  const form = useForm<OnboardingPasswordInput>({
    resolver: zodResolver(OnboardingPasswordSchema),
    defaultValues: { password: "", confirm: "" },
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

  function translate(msg: string | undefined): string | undefined {
    if (!msg) return undefined
    if (msg.startsWith("password.")) return tValidation(msg)
    return msg
  }

  async function onSubmit(values: OnboardingPasswordInput) {
    setServerError(null)
    const result = await submitMemberPasswordAction(values)
    if (!result.ok) {
      setServerError(tErrors(result.errorKey ?? "createAccountFailed"))
      return
    }
    router.push("/onboarding/member/done")
  }

  return (
    <div className="flex flex-col gap-8">
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
              onGenerate={(pw) =>
                form.setValue("confirm", pw, { shouldValidate: false })
              }
            />
            {form.formState.errors.password && (
              <FieldError>
                {translate(form.formState.errors.password.message)}
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
                {translate(form.formState.errors.confirm.message)}
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
