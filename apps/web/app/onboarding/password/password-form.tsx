"use client"

import { useMemo, useState } from "react"
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
import { Heading } from "@workspace/ui/components/heading"
import { PasswordChecklist } from "@workspace/ui/components/password-checklist"
import { PasswordInput } from "@workspace/ui/components/password-input"
import { Text } from "@workspace/ui/components/text"
import { ArrowLeft } from "@workspace/ui/lib/icons"

import { AuthHeaderLinkOverride } from "../../auth/(default)/_components/auth-header-link"
import { submitPasswordAction } from "../actions"
import type { OnboardingRole } from "../_lib/role-types"

interface Props {
  email: string
  role: OnboardingRole
}

export function PasswordForm({ email, role }: Props) {
  const router = useRouter()
  const t = useTranslations("onboarding.password")
  const tCommon = useTranslations("common")
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

  const backIcon = useMemo(
    () => <ArrowLeft className="size-4" aria-hidden="true" />,
    [],
  )

  function translate(msg: string | undefined): string | undefined {
    if (!msg) return undefined
    if (msg.startsWith("password.")) return tValidation(msg)
    return msg
  }

  async function onSubmit(values: OnboardingPasswordInput) {
    setServerError(null)
    const result = await submitPasswordAction(values)
    if (!result.ok) {
      setServerError(tErrors(result.errorKey ?? "createAccountFailed"))
      return
    }
    // Owner → workspace step; Member → done (then redirect to their
    // org via the done card). The action reuses the same cookie-based
    // role detection internally.
    if (role === "member") {
      router.push("/onboarding/done")
    } else {
      router.push("/onboarding/workspace")
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <AuthHeaderLinkOverride
        href="/onboarding/experience"
        label={tCommon("back")}
        icon={backIcon}
      />
      <header className="flex flex-col gap-2">
        <Heading level={2} className="mt-0">
          {t("title")}
        </Heading>
        <Text variant="muted">{t("description", { email })}</Text>
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
              inputSize="xl"
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
              inputSize="xl"
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
