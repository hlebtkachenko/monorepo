"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "@workspace/i18n/client"
import { authClient } from "@workspace/auth/client"
import { LoginMfaForm as LoginMfaFormBlock } from "@workspace/ui/blocks/auth"

import { clearLoginEmailAction } from "../actions"
import { checkAdminAllowlistAction } from "../check-allowlist-action"

interface Props {
  email: string
}

export function LoginMfaForm({ email }: Props) {
  const router = useRouter()
  const search = useSearchParams()
  const t = useTranslations("auth.login.mfa")
  const tValidation = useTranslations("auth.validation")
  const tErrors = useTranslations("auth.errors")

  return (
    <LoginMfaFormBlock
      email={email}
      defaultNext="/"
      next={search.get("next") ?? undefined}
      afterSignInGate={checkAdminAllowlistAction}
      onVerifyTotp={(code) => authClient.twoFactor.verifyTotp({ code })}
      onVerifyBackupCode={(code) =>
        authClient.twoFactor.verifyBackupCode({ code })
      }
      onClearLoginEmail={clearLoginEmailAction}
      onSignOut={async () => {
        await authClient.signOut()
      }}
      onNavigate={(href) => router.push(href)}
      messages={{
        title: t("title"),
        description: (e) => t("description", { email: e }),
        label: t("label"),
        submit: t("submit"),
        submitting: t("submitting"),
        useRecoveryCode: t("useRecoveryCode"),
        recoveryTitle: t("recoveryTitle"),
        recoveryDescription: (e) => t("recoveryDescription", { email: e }),
        recoveryLabel: t("recoveryLabel"),
        recoveryPlaceholder: t("recoveryPlaceholder"),
        useAuthenticator: t("useAuthenticator"),
        invalidCode: tErrors("invalidCode"),
        validationFor: (key) =>
          tValidation(key as Parameters<typeof tValidation>[0]),
      }}
    />
  )
}
