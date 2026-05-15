"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ChevronLeft } from "lucide-react"

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
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@workspace/ui/components/input-otp"

import { safeNext } from "../../../../../lib/safe-next"
import { clearLoginEmailAction } from "../actions"

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

  const form = useForm<OTPInput>({
    resolver: zodResolver(OTPSchema),
    defaultValues: { code: "" },
    mode: "onSubmit",
  })

  const [serverError, setServerError] = useState<string | null>(null)

  function translateValidation(msg: string | undefined): string | undefined {
    if (!msg) return undefined
    if (msg.startsWith("otp.")) return tValidation(msg)
    return msg
  }

  async function onSubmit(values: OTPInput) {
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

  const code = form.watch("code")

  return (
    <div className="flex flex-col gap-8">
      <Link
        href="/auth/login/password"
        className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        {t("tryAnotherMethod")}
      </Link>

      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
        <p className="text-xs text-muted-foreground">{email}</p>
      </header>

      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-5"
        noValidate
      >
        <FieldGroup>
          <Field data-invalid={form.formState.errors.code ? "true" : undefined}>
            <FieldLabel htmlFor="otp">{t("label")}</FieldLabel>
            <InputOTP
              id="otp"
              maxLength={6}
              value={code}
              onChange={(v) =>
                form.setValue("code", v, { shouldValidate: false })
              }
              autoFocus
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
            {form.formState.errors.code && (
              <FieldError>
                {translateValidation(form.formState.errors.code.message)}
              </FieldError>
            )}
          </Field>
        </FieldGroup>

        {serverError && (
          <p className="text-sm text-destructive" role="alert">
            {serverError}
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          disabled={form.formState.isSubmitting || code.length !== 6}
        >
          {form.formState.isSubmitting ? t("submitting") : t("submit")}
        </Button>
      </form>
    </div>
  )
}
