"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { useTranslations } from "@workspace/i18n/client"
import { ExperienceSchema, type ExperienceInput } from "@workspace/shared/auth"
import { Button } from "@workspace/ui/components/button"
import {
  ChoiceCard,
  ChoiceCardGrid,
} from "@workspace/ui/components/choice-card"
import { FieldError } from "@workspace/ui/components/field"
import { Heading } from "@workspace/ui/components/heading"
import { RadioGroup } from "@workspace/ui/components/radio-group"
import { Text } from "@workspace/ui/components/text"
import {
  ArrowLeft,
  Award,
  BookOpen,
  GraduationCap,
  Sparkles,
} from "@workspace/ui/lib/icons"

import { AuthHeaderLinkOverride } from "../../auth/(default)/_components/auth-header-link"
import { submitExperienceAction } from "../actions"

const OPTION_KEYS = ["new", "some", "bookkeeper", "accountant"] as const
type ExperienceKey = (typeof OPTION_KEYS)[number]

const OPTION_ICONS: Record<ExperienceKey, React.ReactNode> = {
  new: <GraduationCap />,
  some: <Sparkles />,
  bookkeeper: <BookOpen />,
  accountant: <Award />,
}

interface Props {
  initial?: ExperienceKey
}

export function ExperienceForm({ initial }: Props) {
  const router = useRouter()
  const t = useTranslations("onboarding.experience")
  const tCommon = useTranslations("common")
  const tErrors = useTranslations("onboarding.errors")

  const form = useForm<ExperienceInput>({
    resolver: zodResolver(ExperienceSchema),
    defaultValues: { experience: initial ?? OPTION_KEYS[0] },
    mode: "onSubmit",
  })

  const [serverError, setServerError] = useState<string | null>(null)

  const backIcon = useMemo(
    () => <ArrowLeft className="size-4" aria-hidden="true" />,
    [],
  )

  async function onSubmit(values: ExperienceInput) {
    setServerError(null)
    const result = await submitExperienceAction(values)
    if (!result.ok) {
      setServerError(tErrors(result.errorKey ?? "saveExperienceFailed"))
      return
    }
    router.push("/onboarding/password")
  }

  const selected = form.watch("experience")

  return (
    <div className="flex flex-col gap-8">
      <AuthHeaderLinkOverride
        href="/onboarding/profile"
        label={tCommon("back")}
        icon={backIcon}
      />
      <header className="flex flex-col gap-2">
        <Heading level={2} className="mt-0">
          {t("title")}
        </Heading>
        <Text variant="muted">{t("description")}</Text>
      </header>

      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-5"
        noValidate
      >
        <RadioGroup
          value={selected}
          onValueChange={(v: string) =>
            form.setValue("experience", v as ExperienceKey, {
              shouldValidate: false,
            })
          }
          aria-label={t("title")}
        >
          <ChoiceCardGrid columns={2}>
            {OPTION_KEYS.map((key) => (
              <ChoiceCard
                key={key}
                value={key}
                icon={OPTION_ICONS[key]}
                title={t(`options.${key}.title`)}
                description={t(`options.${key}.description`)}
              />
            ))}
          </ChoiceCardGrid>
        </RadioGroup>

        {form.formState.errors.experience && (
          <FieldError>{form.formState.errors.experience.message}</FieldError>
        )}

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
