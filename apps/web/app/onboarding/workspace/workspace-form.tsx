"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { useTranslations } from "@workspace/i18n/client"
import { WorkspaceSchema, type WorkspaceInput } from "@workspace/shared/auth"
import { Button } from "@workspace/ui/components/button"
import {
  ChoiceCard,
  ChoiceCardGrid,
} from "@workspace/ui/components/choice-card"
import { RadioGroup } from "@workspace/ui/components/radio-group"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Heading } from "@workspace/ui/components/heading"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Text } from "@workspace/ui/components/text"
import { Briefcase, Building2 } from "@workspace/ui/lib/icons"

import { submitWorkspaceAction } from "../actions"

const USE_CASE_KEYS = ["firm", "biz"] as const
type UseCaseKey = (typeof USE_CASE_KEYS)[number]

const USE_CASE_ICONS: Record<UseCaseKey, React.ReactNode> = {
  firm: <Briefcase />,
  biz: <Building2 />,
}

const TEAM_SIZE_KEYS = ["solo", "sm", "md", "lg", "xl"] as const
type TeamSizeKey = (typeof TEAM_SIZE_KEYS)[number]

export function WorkspaceForm() {
  const router = useRouter()
  const t = useTranslations("onboarding.workspace")
  const tBrand = useTranslations("brand")
  const tValidation = useTranslations("auth.validation")
  const tErrors = useTranslations("onboarding.errors")

  const form = useForm<WorkspaceInput>({
    resolver: zodResolver(WorkspaceSchema),
    defaultValues: {
      displayName: "",
      useCase: "firm",
      teamSize: "solo",
    },
    mode: "onSubmit",
  })

  const [serverError, setServerError] = useState<string | null>(null)

  function translate(msg: string | undefined): string | undefined {
    if (!msg) return undefined
    if (msg.startsWith("workspace.")) return tValidation(msg)
    return msg
  }

  async function onSubmit(values: WorkspaceInput) {
    setServerError(null)
    const result = await submitWorkspaceAction(values)
    if (!result.ok) {
      setServerError(tErrors(result.errorKey ?? "createWorkspaceFailed"))
      return
    }
    router.push("/onboarding/plan")
  }

  const useCase = form.watch("useCase")
  const teamSize = form.watch("teamSize")

  return (
    <div className="flex flex-col gap-8">
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
          <Field
            data-invalid={
              form.formState.errors.displayName ? "true" : undefined
            }
          >
            <FieldLabel htmlFor="displayName">{t("displayName")}</FieldLabel>
            <Input
              id="displayName"
              inputSize="xl"
              autoComplete="organization"
              autoFocus
              placeholder={t("displayNamePlaceholder")}
              {...form.register("displayName")}
              aria-invalid={!!form.formState.errors.displayName}
            />
            {form.formState.errors.displayName && (
              <FieldError>
                {translate(form.formState.errors.displayName.message)}
              </FieldError>
            )}
          </Field>

          <Field>
            <FieldLabel>{t("useCase", { brand: tBrand("name") })}</FieldLabel>
            <RadioGroup
              value={useCase}
              onValueChange={(v: string) =>
                form.setValue("useCase", v as UseCaseKey, {
                  shouldValidate: false,
                })
              }
              aria-label={t("useCase", { brand: tBrand("name") })}
            >
              <ChoiceCardGrid columns={2}>
                {USE_CASE_KEYS.map((key) => (
                  <ChoiceCard
                    key={key}
                    value={key}
                    icon={USE_CASE_ICONS[key]}
                    title={t(`useCaseOptions.${key}.title`)}
                    description={t(`useCaseOptions.${key}.description`)}
                  />
                ))}
              </ChoiceCardGrid>
            </RadioGroup>
          </Field>

          <Field>
            <FieldLabel htmlFor="teamSize">{t("teamSize")}</FieldLabel>
            <Select
              value={teamSize}
              onValueChange={(v) => form.setValue("teamSize", v as TeamSizeKey)}
            >
              <SelectTrigger id="teamSize">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEAM_SIZE_KEYS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {t(`teamSizeOptions.${key}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
    </div>
  )
}
