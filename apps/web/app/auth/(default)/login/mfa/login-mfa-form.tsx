"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { authClient } from "@workspace/auth/client"
import { useTranslations } from "@workspace/i18n/client"
import { OTPSchema, type OTPInput } from "@workspace/shared/auth"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Heading } from "@workspace/ui/components/heading"
import { Input } from "@workspace/ui/components/input"
import {
  INPUT_OTP_PATTERNS,
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@workspace/ui/components/input-otp"
import { Text } from "@workspace/ui/components/text"

import { safeNext } from "../../../../../lib/safe-next"
import { clearLoginEmailAction } from "../actions"

type Mode = "totp" | "recovery"

interface Props {
  email: string
}

export function LoginMfaForm({ email }: Props) {
  const router = useRouter()
  const search = useSearchParams()
  const next = safeNext(search.get("next"), "/workspace")

  const t = useTranslations("auth.login.mfa")
  const tValidation = useTranslations("auth.validation")
  const tErrors = useTranslations("auth.errors")

  const [mode, setMode] = useState<Mode>("totp")
  const [serverError, setServerError] = useState<string | null>(null)

  const totpForm = useForm<OTPInput>({
    resolver: zodResolver(OTPSchema),
    defaultValues: { code: "" },
    mode: "onSubmit",
  })

  const [recoveryCode, setRecoveryCode] = useState("")
  const [recoverySubmitting, setRecoverySubmitting] = useState(false)

  function translateOtpValidation(msg: string | undefined): string | undefined {
    if (!msg) return undefined
    if (msg.startsWith("otp.")) return tValidation(msg)
    return msg
  }

  async function onSubmitTotp(values: OTPInput) {
    setServerError(null)
    try {
      const result = await authClient.twoFactor.verifyTotp({
        code: values.code,
      })
      if (result.error) {
        setServerError(result.error.message ?? tErrors("invalidCode"))
        return
      }
      await clearLoginEmailAction()
      router.push(next)
    } catch (err) {
      setServerError((err as Error).message ?? tErrors("invalidCode"))
    }
  }

  async function onSubmitRecovery(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setServerError(null)
    setRecoverySubmitting(true)
    try {
      const result = await authClient.twoFactor.verifyBackupCode({
        code: recoveryCode.trim(),
      })
      if (result.error) {
        setServerError(result.error.message ?? tErrors("invalidCode"))
        setRecoverySubmitting(false)
        return
      }
      await clearLoginEmailAction()
      router.push(next)
    } catch (err) {
      setServerError((err as Error).message ?? tErrors("invalidCode"))
      setRecoverySubmitting(false)
    }
  }

  const code = totpForm.watch("code")

  if (mode === "recovery") {
    return (
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <Heading level={2} className="mt-0">
            {t("recoveryTitle")}
          </Heading>
          <Text variant="muted">{t("recoveryDescription", { email })}</Text>
        </header>

        <form
          onSubmit={onSubmitRecovery}
          className="flex flex-col gap-5"
          noValidate
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="recovery-code">
                {t("recoveryLabel")}
              </FieldLabel>
              <Input
                id="recovery-code"
                type="text"
                inputSize="xl"
                autoComplete="one-time-code"
                autoFocus
                maxLength={11}
                placeholder={t("recoveryPlaceholder")}
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
              />
            </Field>
          </FieldGroup>

          {serverError && (
            <Text variant="small" className="text-destructive" role="alert">
              {serverError}
            </Text>
          )}

          <Button
            type="submit"
            size="xl"
            disabled={recoverySubmitting || recoveryCode.trim().length === 0}
          >
            {recoverySubmitting ? t("submitting") : t("submit")}
          </Button>

          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto self-start p-0 text-muted-foreground"
            onClick={() => {
              setMode("totp")
              setServerError(null)
            }}
          >
            {t("useAuthenticator")}
          </Button>
        </form>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Heading level={2} className="mt-0">
          {t("title")}
        </Heading>
        <Text variant="muted">{t("description", { email })}</Text>
      </header>

      <form
        onSubmit={totpForm.handleSubmit(onSubmitTotp)}
        className="flex flex-col gap-5"
        noValidate
      >
        <FieldGroup>
          <Field
            data-invalid={totpForm.formState.errors.code ? "true" : undefined}
          >
            <FieldLabel htmlFor="otp">{t("label")}</FieldLabel>
            <InputOTP
              id="otp"
              maxLength={6}
              pattern={INPUT_OTP_PATTERNS.numeric}
              inputMode="numeric"
              value={code}
              onChange={(v) =>
                totpForm.setValue("code", v, { shouldValidate: false })
              }
              containerClassName="w-full"
              autoFocus
            >
              <InputOTPGroup size="xl">
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
            {totpForm.formState.errors.code && (
              <FieldError>
                {translateOtpValidation(totpForm.formState.errors.code.message)}
              </FieldError>
            )}
          </Field>
        </FieldGroup>

        {serverError && (
          <Text variant="small" className="text-destructive" role="alert">
            {serverError}
          </Text>
        )}

        <Button
          type="submit"
          size="xl"
          disabled={totpForm.formState.isSubmitting || code.length !== 6}
        >
          {totpForm.formState.isSubmitting ? t("submitting") : t("submit")}
        </Button>

        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto self-start p-0 text-muted-foreground"
          onClick={() => {
            setMode("recovery")
            setServerError(null)
          }}
        >
          {t("useRecoveryCode")}
        </Button>
      </form>
    </div>
  )
}
