"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "@workspace/i18n/client"
import { LoginEmailForm as LoginEmailFormBlock } from "@workspace/ui/blocks/auth"

import { identifyEmailAction } from "./actions"

export function LoginEmailForm() {
  const router = useRouter()
  const search = useSearchParams()
  const tBrand = useTranslations("brand")
  const t = useTranslations("auth.login.email")
  const tAdmin = useTranslations("admin.auth.login.email")
  const tValidation = useTranslations("auth.validation")
  const tErrors = useTranslations("auth.errors")

  const brandName = tBrand("name")

  return (
    <LoginEmailFormBlock
      defaultNext="/"
      next={search.get("next") ?? undefined}
      initialErrorCode={search.get("error")}
      onSubmitEmail={identifyEmailAction}
      onNavigate={(href) => router.push(href)}
      messages={{
        title: tAdmin.rich("title", {
          brand: brandName,
          admin: (chunks) => <span className="text-foreground">{chunks}</span>,
        }),
        description: t("description"),
        label: t("label"),
        placeholder: tAdmin("placeholder"),
        submit: t("submit"),
        submitting: t("submitting"),
        errorFor: (code) => tErrors(code),
        validationFor: (key) =>
          tValidation(key as Parameters<typeof tValidation>[0]),
        signInFailed: tErrors("signInFailed"),
      }}
    />
  )
}
