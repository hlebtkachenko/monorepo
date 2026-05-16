"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { useTranslations } from "@workspace/i18n/client"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Heading } from "@workspace/ui/components/heading"
import { Text } from "@workspace/ui/components/text"
import {
  Building2,
  CheckCircle2,
  Sparkles,
  UserPlus,
} from "@workspace/ui/lib/icons"

import { completeOnboardingAction } from "../actions"
import type { OnboardingRole } from "../_lib/role-types"

// Owner: full 7-step timeline. Member: profile, experience, password,
// and the terminal "ready" step (step7) so the user sees they're done.
const OWNER_TIMELINE_KEYS = [
  "step1",
  "step2",
  "step3",
  "step4",
  "step5",
  "step6",
  "step7",
] as const
const MEMBER_TIMELINE_KEYS = ["step1", "step2", "step3", "step7"] as const

interface Props {
  role: OnboardingRole
}

export function DoneCard({ role }: Props) {
  const router = useRouter()
  const t = useTranslations("onboarding.done")
  const tBrand = useTranslations("brand")
  const tErrors = useTranslations("onboarding.errors")
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const timelineKeys =
    role === "owner" ? OWNER_TIMELINE_KEYS : MEMBER_TIMELINE_KEYS

  async function onOpen() {
    setSubmitting(true)
    setServerError(null)
    const result = await completeOnboardingAction()
    if (!result.ok) {
      setServerError(tErrors(result.errorKey ?? "createWorkspaceFailed"))
      setSubmitting(false)
      return
    }
    // Both flows land at /workspace — the canonical top-level chooser.
    // Members can switch into their newly-joined org from there.
    router.push("/workspace")
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Heading level={2} className="mt-0">
          {t("title")}
        </Heading>
        <Text variant="muted">{t("description")}</Text>
      </header>

      <ol className="flex flex-col gap-2" aria-label={t("timelineLabel")}>
        {timelineKeys.map((key) => (
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

      {role === "owner" && (
        <Card>
          <CardContent className="flex flex-col gap-4 p-5">
            <Text variant="small" className="font-semibold">
              {t("nextSteps.title")}
            </Text>
            <ul className="flex flex-col gap-3">
              <li className="flex items-start gap-3 text-sm">
                <Building2
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div className="flex flex-col">
                  <span className="font-medium">{t("nextSteps.addOrg")}</span>
                  <span className="text-xs text-muted-foreground">
                    {t("nextSteps.addOrgDescription")}
                  </span>
                </div>
              </li>
              <li className="flex items-start gap-3 text-sm">
                <UserPlus
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div className="flex flex-col">
                  <span className="font-medium">
                    {t("nextSteps.inviteMore")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t("nextSteps.inviteMoreDescription")}
                  </span>
                </div>
              </li>
              <li className="flex items-start gap-3 text-sm">
                <Sparkles
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div className="flex flex-col">
                  <span className="font-medium">
                    {t("nextSteps.exploreAgents")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t("nextSteps.exploreAgentsDescription")}
                  </span>
                </div>
              </li>
            </ul>
          </CardContent>
        </Card>
      )}

      {serverError && (
        <Text variant="small" className="text-destructive" role="alert">
          {serverError}
        </Text>
      )}

      <Button size="xl" onClick={onOpen} disabled={submitting}>
        {t("open", { brand: tBrand("name") })}
      </Button>
    </div>
  )
}
