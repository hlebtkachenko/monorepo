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
  const tSso = useTranslations("auth.login.sso")
  const tDivider = useTranslations("auth.login")
  const tValidation = useTranslations("auth.validation")
  const tErrors = useTranslations("auth.errors")

  const brandName = tBrand("name")

  return (
    <LoginEmailFormBlock
      defaultNext="/workspace"
      next={search.get("next") ?? undefined}
      initialErrorCode={search.get("error")}
      showSso
      showContactSales
      onSubmitEmail={identifyEmailAction}
      onNavigate={(href) => router.push(href)}
      messages={{
        title: t("title", { brand: brandName }),
        description: t("description"),
        label: t("label"),
        placeholder: t("placeholder"),
        submit: t("submit"),
        submitting: t("submitting"),
        divider: tDivider("divider"),
        ssoLabel: tSso("label"),
        ssoTooltip: tSso("tooltip"),
        contactSalesPrompt: t("contactSalesPrompt", { brand: brandName }),
        contactSalesCta: t("contactSalesCta"),
        errorFor: (code) => tErrors(code),
        validationFor: (key) =>
          tValidation(key as Parameters<typeof tValidation>[0]),
        signInFailed: tErrors("signInFailed"),
      }}
    />
  )
}
