"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { authClient } from "@workspace/auth/client"
import { useTranslations } from "@workspace/i18n/client"
import {
  LoginPasswordSchema,
  type LoginPasswordInput,
} from "@workspace/shared/auth"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@workspace/ui/components/field"
import { Heading } from "@workspace/ui/components/heading"
import { Input } from "@workspace/ui/components/input"
import { PasswordInput } from "@workspace/ui/components/password-input"
import { Text } from "@workspace/ui/components/text"
import { ArrowLeft, Mail } from "@workspace/ui/lib/icons"

import { safeNext } from "../../../../../lib/safe-next"
import { AuthHeaderLinkOverride } from "../../_components/auth-header-link"
import { clearLoginEmailAction, sendMagicLinkAction } from "../actions"

const RESEND_COOLDOWN = 30

interface Props {
  email: string
}

export function LoginPasswordForm({ email }: Props) {
  const router = useRouter()
  const search = useSearchParams()
  const next = safeNext(search.get("next"), "/workspace")

  const tBrand = useTranslations("brand")
  const t = useTranslations("auth.login.password")
  const tValidation = useTranslations("auth.validation")
  const tErrors = useTranslations("auth.errors")

  const form = useForm<LoginPasswordInput>({
    resolver: zodResolver(LoginPasswordSchema),
    defaultValues: { password: "", rememberMe: false },
    mode: "onSubmit",
  })

  const [serverError, setServerError] = useState<string | null>(null)
  const [magicLinkSending, setMagicLinkSending] = useState(false)
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)

  useEffect(() => {
    if (resendCooldown <= 0) return
    const id = setTimeout(() => setResendCooldown((c) => c - 1), 1000)
    return () => clearTimeout(id)
  }, [resendCooldown])

  const sendMagicLink = useCallback(async () => {
    setMagicLinkSending(true)
    setServerError(null)
    const result = await sendMagicLinkAction(email, next)
    if (result.ok) {
      setMagicLinkSent(true)
      setResendCooldown(RESEND_COOLDOWN)
    } else {
      setServerError(result.error ?? tErrors("signInFailed"))
    }
    setMagicLinkSending(false)
  }, [email, next, tErrors])

  function translateValidation(msg: string | undefined): string | undefined {
    if (!msg) return undefined
    if (msg.startsWith("password.")) return tValidation(msg)
    return msg
  }

  async function onSubmit(values: LoginPasswordInput) {
    setServerError(null)
    try {
      const result = await authClient.signIn.email({
        email,
        password: values.password,
        rememberMe: values.rememberMe,
        callbackURL: next,
      })
      if (result.error) {
        setServerError(result.error.message ?? tErrors("invalidCredentials"))
        return
      }
      const data = result.data as { twoFactorRedirect?: boolean } | null
      if (data?.twoFactorRedirect) {
        router.push(`/auth/login/mfa?next=${encodeURIComponent(next)}`)
        return
      }
      await clearLoginEmailAction()
      router.push(next)
    } catch (err) {
      setServerError((err as Error).message ?? tErrors("invalidCredentials"))
    }
  }

  const backIcon = useMemo(
    () => <ArrowLeft className="size-4" aria-hidden="true" />,
    [],
  )

  if (magicLinkSent) {
    return (
      <div className="flex flex-col gap-8">
        <AuthHeaderLinkOverride
          href="/auth/login"
          label={t("useDifferentEmail")}
          icon={backIcon}
        />
        <header className="flex flex-col gap-2">
          <Heading level={2} className="mt-0">
            {t("magicLinkSentTitle")}
          </Heading>
          <Text variant="muted">
            {t("magicLinkSentDescription", { email })}
          </Text>
        </header>

        {serverError && (
          <Text variant="small" className="text-destructive" role="alert">
            {serverError}
          </Text>
        )}

        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto self-start p-0 text-muted-foreground"
          disabled={resendCooldown > 0 || magicLinkSending}
          onClick={sendMagicLink}
        >
          {resendCooldown > 0
            ? t("magicLinkResendIn", { seconds: String(resendCooldown) })
            : t("magicLinkResend")}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <AuthHeaderLinkOverride
        href="/auth/login"
        label={t("useDifferentEmail")}
        icon={backIcon}
      />
      <header className="flex flex-col gap-2">
        <Heading level={2} className="mt-0">
          {t("title")}
        </Heading>
        <Text variant="muted">
          {t("description", { brand: tBrand("name") })}
        </Text>
      </header>

      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-5"
        noValidate
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email-locked">Email</FieldLabel>
            <Input
              id="email-locked"
              type="email"
              inputSize="xl"
              value={email}
              readOnly
              disabled
              autoComplete="username"
            />
          </Field>

          <Field
            data-invalid={form.formState.errors.password ? "true" : undefined}
          >
            <FieldLabel htmlFor="password" className="flex justify-between">
              <span>{t("label")}</span>
              <Link
                href="/auth/forgot-password"
                className="text-sm font-normal text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {t("forgot")}
              </Link>
            </FieldLabel>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              autoFocus
              inputSize="xl"
              value={form.watch("password")}
              onValueChange={(v) =>
                form.setValue("password", v, { shouldValidate: false })
              }
            />
            {form.formState.errors.password && (
              <FieldError>
                {translateValidation(form.formState.errors.password.message)}
              </FieldError>
            )}
          </Field>

          <Field orientation="horizontal">
            <Checkbox
              id="rememberMe"
              checked={form.watch("rememberMe")}
              onCheckedChange={(checked) =>
                form.setValue("rememberMe", checked === true)
              }
            />
            <FieldLabel htmlFor="rememberMe" className="font-normal">
              {t("rememberMe")}
            </FieldLabel>
          </Field>
        </FieldGroup>

        {serverError && (
          <Text variant="small" className="text-destructive" role="alert">
            {serverError}
          </Text>
        )}

        <Button type="submit" size="xl" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? t("submitting") : t("submit")}
        </Button>
      </form>

      <FieldSeparator>or</FieldSeparator>

      <Button
        type="button"
        variant="outline"
        size="xl"
        className="w-full"
        disabled={magicLinkSending}
        onClick={sendMagicLink}
      >
        <Mail className="size-4" aria-hidden="true" />
        {magicLinkSending ? t("submitting") : t("emailMeLink")}
      </Button>
    </div>
  )
}
