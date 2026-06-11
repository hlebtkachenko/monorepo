"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { useTranslations } from "@workspace/i18n/client"
import { PlanSchema, type PlanInput } from "@workspace/shared/auth"
import { Button } from "@workspace/ui/components/button"
import { Heading } from "@workspace/ui/components/heading"
import { PlanCard } from "@workspace/ui/components/plan-card"
import { RadioGroup } from "@workspace/ui/components/radio-group"
import { Text } from "@workspace/ui/components/text"
import { ArrowLeft } from "@workspace/ui/lib/icons"

import { AuthHeaderLinkOverride } from "../../auth/(default)/_components/auth-header-link"
import { submitPlanAction } from "../actions"

type PlanKey = "starter" | "growth" | "scale"
const PLAN_KEYS: readonly PlanKey[] = ["starter", "growth", "scale"] as const

/**
 * Signals from earlier onboarding steps that will shape the plan
 * recommendation. Reserved — not consumed yet.
 */
interface PlanRecommendationContext {
  useCase?: string
  teamSize?: string
  experience?: string
}

const RECOMMENDED_PLAN: PlanKey = "growth"

/**
 * Resolves the recommended plan. Pinned to RECOMMENDED_PLAN for now;
 * a later revision will key the result off PlanRecommendationContext
 * (workspace use-case, team size, experience).
 */
function recommendPlan(_context?: PlanRecommendationContext): PlanKey {
  return RECOMMENDED_PLAN
}

export function PlanForm() {
  const router = useRouter()
  const t = useTranslations("onboarding.plan")
  const tCommon = useTranslations("common")
  const tErrors = useTranslations("onboarding.errors")

  const form = useForm<PlanInput>({
    resolver: zodResolver(PlanSchema),
    defaultValues: { plan: recommendPlan() },
    mode: "onSubmit",
  })

  const [serverError, setServerError] = useState<string | null>(null)

  const backIcon = useMemo(
    () => <ArrowLeft className="size-4" aria-hidden="true" />,
    [],
  )

  async function onSubmit(values: PlanInput) {
    setServerError(null)
    const result = await submitPlanAction(values)
    if (!result.ok) {
      setServerError(
        tErrors(
          (result.errorKey ?? "savePlanFailed") as Parameters<
            typeof tErrors
          >[0],
        ),
      )
      return
    }
    router.push("/onboarding/team")
  }

  const selected = form.watch("plan")

  function featuresFor(plan: PlanKey): string[] {
    const t1 = t(`plans.${plan}.features.f1`)
    const t2 = t(`plans.${plan}.features.f2`)
    const t3 = t(`plans.${plan}.features.f3`)
    const features = [t1, t2, t3]
    if (plan !== "starter") {
      features.push(t(`plans.${plan}.features.f4`))
    }
    return features
  }

  function badgeFor(plan: PlanKey): string | undefined {
    if (plan === "growth") return t("plans.growth.badge")
    return undefined
  }

  return (
    <div className="flex flex-col gap-8">
      <AuthHeaderLinkOverride
        href="/onboarding/workspace"
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
        onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
        className="flex flex-col gap-5"
        noValidate
      >
        <RadioGroup
          value={selected}
          onValueChange={(v: string) =>
            form.setValue("plan", v as PlanKey, { shouldValidate: false })
          }
          aria-label={t("title")}
          className="flex flex-col gap-3"
        >
          {PLAN_KEYS.map((plan) => (
            <PlanCard
              key={plan}
              value={plan}
              name={t(`plans.${plan}.name`)}
              description={t(`plans.${plan}.description`)}
              features={featuresFor(plan)}
              badge={badgeFor(plan)}
              price={{
                amount: t(`plans.${plan}.price`),
                period: t("perMonth"),
              }}
            />
          ))}
        </RadioGroup>

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
