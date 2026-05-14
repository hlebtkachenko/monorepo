"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { KeyRound, ArrowUpRight } from "lucide-react"

import { useTranslations } from "@workspace/i18n/client"
import { LoginEmailSchema, type LoginEmailInput } from "@workspace/shared/auth"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import { identifyEmailAction } from "./actions"

const KNOWN_ERROR_CODES = [
  "no-workspace-access",
  "signup-session-expired",
  "invite-session-expired",
  "missing-signup-token",
  "missing-invite-token",
  "expired",
  "invalid",
  "wrong_kind",
  "disabled",
  "loginSessionExpired",
] as const

function isKnownErrorCode(
  code: string,
): code is (typeof KNOWN_ERROR_CODES)[number] {
  return (KNOWN_ERROR_CODES as readonly string[]).includes(code)
}

export function LoginEmailForm() {
  const router = useRouter()
  const search = useSearchParams()
  const next = search.get("next") ?? "/workspace"
  const errorCode = search.get("error")

  const tBrand = useTranslations("brand")
  const t = useTranslations("auth.login.email")
  const tSso = useTranslations("auth.login.sso")
  const tDivider = useTranslations("auth.login")
  const tValidation = useTranslations("auth.validation")
  const tErrors = useTranslations("auth.errors")

  const form = useForm<LoginEmailInput>({
    resolver: zodResolver(LoginEmailSchema),
    defaultValues: { email: "" },
    mode: "onSubmit",
  })

  const [serverError, setServerError] = useState<string | null>(
    errorCode && isKnownErrorCode(errorCode) ? tErrors(errorCode) : null,
  )

  function translateValidation(
    message: string | undefined,
  ): string | undefined {
    if (!message) return undefined
    if (message.startsWith("email.")) {
      return tValidation(message)
    }
    return message
  }

  async function onSubmit(values: LoginEmailInput) {
    setServerError(null)
    const result = await identifyEmailAction({ email: values.email })
    if (!result.ok) {
      const translated =
        result.errorKey && result.errorKey.startsWith("email.")
          ? tValidation(result.errorKey)
          : (result.errorKey ?? tErrors("signInFailed"))
      setServerError(translated)
      return
    }
    const nextHref =
      `/auth/login/password` +
      (next !== "/workspace" ? `?next=${encodeURIComponent(next)}` : "")
    router.push(nextHref)
  }

  const brandName = tBrand("name")

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          {t("title", { brand: brandName })}
        </h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>

      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-5"
        noValidate
      >
        <FieldGroup>
          <Field
            data-invalid={form.formState.errors.email ? "true" : undefined}
          >
            <FieldLabel htmlFor="email">{t("label")}</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder={t("placeholder")}
              {...form.register("email")}
              aria-invalid={!!form.formState.errors.email}
            />
            {form.formState.errors.email && (
              <FieldError>
                {translateValidation(form.formState.errors.email.message)}
              </FieldError>
            )}
          </Field>
        </FieldGroup>

        {serverError && (
          <p className="text-sm text-destructive" role="alert">
            {serverError}
          </p>
        )}

        <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? t("submitting") : t("submit")}
        </Button>
      </form>

      <FieldSeparator>{tDivider("divider")}</FieldSeparator>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="inline-block">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full"
                disabled
                aria-disabled="true"
              >
                <KeyRound className="size-4" aria-hidden="true" />
                {tSso("label")}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{tSso("tooltip")}</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <p className="text-sm text-muted-foreground">
        {t("contactSalesPrompt", { brand: brandName })}{" "}
        <Link
          href="#"
          className="inline-flex items-center gap-0.5 font-medium text-foreground underline-offset-4 hover:underline"
        >
          {t("contactSalesCta")}
          <ArrowUpRight className="size-3" aria-hidden="true" />
        </Link>
      </p>
    </div>
  )
}
