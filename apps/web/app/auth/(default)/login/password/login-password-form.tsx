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
  const tValidation = useTranslations("auth.validation")
  const tErrors = useTranslations("auth.errors")

  const nextParam = search.get("next") ?? undefined

  return (
    <LoginPasswordFormBlock
      email={email}
      defaultNext="/workspace"
      next={nextParam}
      onSignIn={async ({ email: e, password, rememberMe }) => {
        // Server action: on the success path the action throws NEXT_REDIRECT
        // and never returns. The block treats a thrown redirect as an
        // unhandled error from `onSubmit`; the `noopOnSuccess` flag on the
        // block tells it not to fire its own `onNavigate(next)` after the
        // action resolves, because we never reach that path on success.
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
        description: t("description", { brand: tBrand("name") }),
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
