"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "@workspace/i18n/client"
import { LoginPasswordForm as LoginPasswordFormBlock } from "@workspace/ui/blocks/auth"

import { clearLoginEmailAction, sendMagicLinkAction } from "../actions"
import { signInPasswordAction } from "./actions"

interface Props {
  email: string
}

export function LoginPasswordForm({ email }: Props) {
  const router = useRouter()
  const search = useSearchParams()
  const tBrand = useTranslations("brand")
  const t = useTranslations("auth.login.password")
  const tAdmin = useTranslations("admin.auth.login.password")
  const tValidation = useTranslations("auth.validation")
  const tErrors = useTranslations("auth.errors")

  const nextParam = search.get("next") ?? undefined

  return (
    <LoginPasswordFormBlock
      email={email}
      defaultNext="/"
      next={nextParam}
      onSignIn={async ({ email: e, password, rememberMe }) => {
        // Admin server action: runs the allowlist gate inline and either
        // redirects (allowed) or returns an error banner (denied). The
        // 2FA branch returns `data.twoFactorRedirect` so the form routes
        // to /auth/login/mfa.
        const result = await signInPasswordAction({
          email: e,
          password,
          rememberMe,
          next: nextParam,
        })
        return {
          error: result.error,
          data: result.data,
        }
      }}
      onClearLoginEmail={clearLoginEmailAction}
      onSendMagicLink={sendMagicLinkAction}
      onNavigate={(href) => router.push(href)}
      noopOnSuccess
      messages={{
        title: t("title"),
        description: tAdmin("description", { brand: tBrand("name") }),
        label: t("label"),
        forgot: t("forgot"),
        rememberMe: t("rememberMe"),
        submit: t("submit"),
        submitting: t("submitting"),
        emailMeLink: t("emailMeLink"),
        useDifferentEmail: t("useDifferentEmail"),
        magicLinkSentTitle: t("magicLinkSentTitle"),
        magicLinkSentDescription: (e) =>
          t("magicLinkSentDescription", { email: e }),
        magicLinkResend: t("magicLinkResend"),
        magicLinkResendIn: (s) => t("magicLinkResendIn", { seconds: s }),
        invalidCredentials: tErrors("invalidCredentials"),
        signInFailed: tErrors("signInFailed"),
        validationFor: (key) =>
          tValidation(key as Parameters<typeof tValidation>[0]),
      }}
    />
  )
}
