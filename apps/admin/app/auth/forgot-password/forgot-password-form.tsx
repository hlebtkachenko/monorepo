"use client"

import { useTranslations } from "@workspace/i18n/client"
import { ForgotPasswordForm as ForgotPasswordFormBlock } from "@workspace/ui/blocks/auth"

import { requestPasswordResetAction } from "./actions"

export function ForgotPasswordForm() {
  const t = useTranslations("auth.forgot")
  const tAdmin = useTranslations("admin.auth.forgot")
  const tValidation = useTranslations("auth.validation")

  return (
    <ForgotPasswordFormBlock
      onRequestPasswordReset={requestPasswordResetAction}
      messages={{
        title: t("title"),
        description: t("description"),
        label: t("label"),
        placeholder: tAdmin("placeholder"),
        submit: t("submit"),
        submitting: t("submitting"),
        backToLogin: t("backToLogin"),
        sentTitle: t("sent.title"),
        sentDescription: (email) => t("sent.description", { email }),
        sentResend: t("sent.resend"),
        sentResendIn: (seconds) => t("sent.resendIn", { seconds }),
        validationFor: (key) =>
          tValidation(key as Parameters<typeof tValidation>[0]),
      }}
    />
  )
}
