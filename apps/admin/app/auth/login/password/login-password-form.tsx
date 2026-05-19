"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "@workspace/i18n/client"
import { authClient } from "@workspace/auth/client"
import { LoginPasswordForm as LoginPasswordFormBlock } from "@workspace/ui/blocks/auth"

import { clearLoginEmailAction, sendMagicLinkAction } from "../actions"
import { checkAdminAllowlistAction } from "../check-allowlist-action"

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

  return (
    <LoginPasswordFormBlock
      email={email}
      defaultNext="/"
      next={search.get("next") ?? undefined}
      afterSignInGate={checkAdminAllowlistAction}
      onSignIn={async ({ email: e, password, rememberMe, callbackURL }) => {
        const result = await authClient.signIn.email({
          email: e,
          password,
          rememberMe,
          callbackURL,
        })
        return {
          error: result.error ?? null,
          data: result.data as { twoFactorRedirect?: boolean } | null,
        }
      }}
      onClearLoginEmail={clearLoginEmailAction}
      onSendMagicLink={sendMagicLinkAction}
      onSignOut={async () => {
        await authClient.signOut()
      }}
      onNavigate={(href) => router.push(href)}
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
        validationFor: (key) => tValidation(key),
      }}
    />
  )
}
