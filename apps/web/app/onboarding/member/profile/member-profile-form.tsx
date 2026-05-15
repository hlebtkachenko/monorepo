"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { useTranslations } from "@workspace/i18n/client"
import { ProfileSchema, type ProfileInput } from "@workspace/shared/auth"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

import { submitProfileAction } from "../../actions"

const SUPPORTED_LOCALES = [{ value: "en", label: "English" }] as const

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

function listTimezones(): string[] {
  try {
    const intl = Intl as unknown as {
      supportedValuesOf?: (k: string) => string[]
    }
    return intl.supportedValuesOf?.("timeZone") ?? ["UTC"]
  } catch {
    return ["UTC"]
  }
}

interface Props {
  initial?: Partial<ProfileInput>
}

export function MemberProfileForm({ initial }: Props) {
  const router = useRouter()
  const t = useTranslations("onboarding.profile")
  const tBrand = useTranslations("brand")
  const tValidation = useTranslations("auth.validation")
  const tErrors = useTranslations("onboarding.errors")

  const defaultTimezone = useMemo(detectTimezone, [])
  const timezones = useMemo(listTimezones, [])

  const form = useForm<ProfileInput>({
    resolver: zodResolver(ProfileSchema),
    defaultValues: {
      firstName: initial?.firstName ?? "",
      lastName: initial?.lastName ?? "",
      phone: initial?.phone ?? "",
      locale: initial?.locale ?? SUPPORTED_LOCALES[0].value,
      timezone: initial?.timezone ?? defaultTimezone,
    },
    mode: "onSubmit",
  })

  const [serverError, setServerError] = useState<string | null>(null)

  function translate(msg: string | undefined): string | undefined {
    if (!msg) return undefined
    if (
      msg.startsWith("name.") ||
      msg.startsWith("phone.") ||
      msg.startsWith("email.")
    ) {
      return tValidation(msg)
    }
    return msg
  }

  async function onSubmit(values: ProfileInput) {
    setServerError(null)
    const result = await submitProfileAction(values)
    if (!result.ok) {
      setServerError(tErrors(result.errorKey ?? "saveProfileFailed"))
      return
    }
    router.push("/onboarding/member/experience")
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("description", { brand: tBrand("name") })}
        </p>
      </header>

      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-5"
        noValidate
      >
        <FieldGroup>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              data-invalid={
                form.formState.errors.firstName ? "true" : undefined
              }
            >
              <FieldLabel htmlFor="firstName">{t("firstName")}</FieldLabel>
              <Input
                id="firstName"
                autoComplete="given-name"
                autoFocus
                {...form.register("firstName")}
                aria-invalid={!!form.formState.errors.firstName}
              />
              {form.formState.errors.firstName && (
                <FieldError>
                  {translate(form.formState.errors.firstName.message)}
                </FieldError>
              )}
            </Field>
            <Field
              data-invalid={form.formState.errors.lastName ? "true" : undefined}
            >
              <FieldLabel htmlFor="lastName">{t("lastName")}</FieldLabel>
              <Input
                id="lastName"
                autoComplete="family-name"
                {...form.register("lastName")}
                aria-invalid={!!form.formState.errors.lastName}
              />
              {form.formState.errors.lastName && (
                <FieldError>
                  {translate(form.formState.errors.lastName.message)}
                </FieldError>
              )}
            </Field>
          </div>

          <Field
            data-invalid={form.formState.errors.phone ? "true" : undefined}
          >
            <FieldLabel htmlFor="phone">{t("phone")}</FieldLabel>
            <Input
              id="phone"
              type="tel"
              autoComplete="tel"
              placeholder={t("phonePlaceholder")}
              {...form.register("phone")}
              aria-invalid={!!form.formState.errors.phone}
            />
            {form.formState.errors.phone && (
              <FieldError>
                {translate(form.formState.errors.phone.message)}
              </FieldError>
            )}
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="locale">{t("locale")}</FieldLabel>
              <Select
                value={form.watch("locale")}
                onValueChange={(v: string) => form.setValue("locale", v)}
              >
                <SelectTrigger id="locale">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_LOCALES.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="timezone">{t("timezone")}</FieldLabel>
              <Select
                value={form.watch("timezone")}
                onValueChange={(v: string) => form.setValue("timezone", v)}
              >
                <SelectTrigger id="timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timezones.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
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
    </div>
  )
}
