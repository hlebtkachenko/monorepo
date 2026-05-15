"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2 } from "lucide-react"

import { useTranslations } from "@workspace/i18n/client"
import { Button } from "@workspace/ui/components/button"

import { completeMemberOnboardingAction } from "../actions"

const TIMELINE_KEYS = ["step1", "step2", "step3", "step7"] as const

export function MemberDoneCard() {
  const router = useRouter()
  const t = useTranslations("onboarding.done")
  const tBrand = useTranslations("brand")
  const [submitting, setSubmitting] = useState(false)

  async function onOpen() {
    setSubmitting(true)
    await completeMemberOnboardingAction()
    // Always land on /workspace — the canonical top-level chooser above
    // orgs. The member can switch into the org they just joined (or any
    // other) from there.
    router.push("/workspace")
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>

      <ol className="flex flex-col gap-2" aria-label={t("timelineLabel")}>
        {TIMELINE_KEYS.map((key) => (
          <li
            key={key}
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <CheckCircle2
              className="size-4 shrink-0 text-primary"
              aria-hidden="true"
            />
            <span>{t(`timeline.${key}`)}</span>
          </li>
        ))}
      </ol>

      <Button size="lg" onClick={onOpen} disabled={submitting}>
        {t("open", { brand: tBrand("name") })}
      </Button>
    </div>
  )
}
