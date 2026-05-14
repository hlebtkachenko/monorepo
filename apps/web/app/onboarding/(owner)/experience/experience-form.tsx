"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { GraduationCap, Sparkles, BookOpen, Award } from "lucide-react"

import { useTranslations } from "@workspace/i18n/client"
import { ExperienceSchema, type ExperienceInput } from "@workspace/shared/auth"
import { Button } from "@workspace/ui/components/button"
import {
  ChoiceCard,
  ChoiceCardGrid,
} from "@workspace/ui/components/choice-card"
import { FieldError } from "@workspace/ui/components/field"
import { RadioGroup } from "@workspace/ui/components/radio-group"

import { submitExperienceAction } from "../../actions"

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
  const tErrors = useTranslations("onboarding.errors")

  const form = useForm<ExperienceInput>({
    resolver: zodResolver(ExperienceSchema),
    defaultValues: { experience: initial ?? OPTION_KEYS[0] },
    mode: "onSubmit",
  })

  const [serverError, setServerError] = useState<string | null>(null)

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
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
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
