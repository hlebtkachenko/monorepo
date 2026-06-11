"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "@workspace/i18n/client"
import { ResetPasswordForm as ResetPasswordFormBlock } from "@workspace/ui/blocks/auth"

import { resetPasswordAction } from "./actions"

export function ResetPasswordForm() {
  const router = useRouter()
  const search = useSearchParams()
  const token = search.get("token") ?? ""

  const t = useTranslations("auth.reset")
  const tValidation = useTranslations("auth.validation")
  const tErrors = useTranslations("auth.errors")

  return (
    <ResetPasswordFormBlock
      token={token}
      onResetPassword={resetPasswordAction}
      onNavigate={(href) => router.push(href)}
      messages={{
        title: t("title"),
        description: t("description"),
        newPasswordLabel: t("newPasswordLabel"),
        confirmPasswordLabel: t("confirmPasswordLabel"),
        submit: t("submit"),
        submitting: t("submitting"),
        backToLogin: t("backToLogin"),
        invalidLinkTitle: t("invalidLink.title"),
        invalidLinkDescription: t("invalidLink.description"),
        invalidLinkRequestNew: t("invalidLink.requestNew"),
        successTitle: t("success.title"),
        successDescription: t("success.description"),
        successSignIn: t("success.signIn"),
        resetFailed: tErrors("resetFailed"),
        validationFor: (key) =>
          tValidation(key as Parameters<typeof tValidation>[0]),
      }}
    />
  )
}
