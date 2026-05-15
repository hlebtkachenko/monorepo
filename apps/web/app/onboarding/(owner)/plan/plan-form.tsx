"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { useTranslations } from "@workspace/i18n/client"
import { PlanSchema, type PlanInput } from "@workspace/shared/auth"
import { Button } from "@workspace/ui/components/button"
import { PlanCard } from "@workspace/ui/components/plan-card"
import { RadioGroup } from "@workspace/ui/components/radio-group"

import { submitPlanAction } from "../../actions"

type PlanKey = "starter" | "growth" | "scale"
const PLAN_KEYS: readonly PlanKey[] = ["starter", "growth", "scale"] as const

export function PlanForm() {
  const router = useRouter()
  const t = useTranslations("onboarding.plan")
  const tErrors = useTranslations("onboarding.errors")

  const form = useForm<PlanInput>({
    resolver: zodResolver(PlanSchema),
    defaultValues: { plan: "starter" },
    mode: "onSubmit",
  })

  const [serverError, setServerError] = useState<string | null>(null)

  async function onSubmit(values: PlanInput) {
    setServerError(null)
    const result = await submitPlanAction(values)
    if (!result.ok) {
      setServerError(tErrors(result.errorKey ?? "savePlanFailed"))
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
