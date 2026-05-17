"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { useTranslations } from "@workspace/i18n/client"
import { BorderBeam } from "@workspace/ui/components/border-beam"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Heading } from "@workspace/ui/components/heading"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import { MultiStepLoader } from "@workspace/ui/components/multi-step-loader"
import { Text } from "@workspace/ui/components/text"
import {
  Building2,
  CheckCircle2,
  Sparkles,
  UserPlus,
} from "@workspace/ui/lib/icons"

import { completeOnboardingAction } from "../actions"
import type { OnboardingRole } from "../_lib/role-types"

// Owner: six-step recap timeline. Member: profile, experience, password.
const OWNER_TIMELINE_KEYS = [
  "step1",
  "step2",
  "step3",
  "step4",
  "step5",
  "step6",
] as const
const MEMBER_TIMELINE_KEYS = ["step1", "step2", "step3"] as const

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
  // Celebratory loader rolls once when the page opens, then reveals
  // the summary card underneath.
  const [introPlaying, setIntroPlaying] = useState(true)

  const timelineKeys =
    role === "owner" ? OWNER_TIMELINE_KEYS : MEMBER_TIMELINE_KEYS

  const loaderSteps = timelineKeys.map((key) => ({
    text: t(`timeline.${key}`),
  }))

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
    <>
      <MultiStepLoader
        loading={introPlaying}
        loop={false}
        finalStatus="success"
        duration={550}
        loadingStates={loaderSteps}
        onClose={() => setIntroPlaying(false)}
      />

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
                className="size-4 shrink-0 text-success"
                aria-hidden="true"
              />
              <span>{t(`timeline.${key}`)}</span>
            </li>
          ))}
        </ol>

        {role === "owner" && (
          <Card>
            <CardHeader>
              <CardTitle>{t("nextSteps.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ItemGroup>
                <Item variant="muted">
                  <ItemMedia variant="icon">
                    <Building2
                      className="text-muted-foreground"
                      aria-hidden="true"
                    />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{t("nextSteps.addOrg")}</ItemTitle>
                    <ItemDescription>
                      {t("nextSteps.addOrgDescription")}
                    </ItemDescription>
                  </ItemContent>
                </Item>
                <Item variant="muted">
                  <ItemMedia variant="icon">
                    <UserPlus
                      className="text-muted-foreground"
                      aria-hidden="true"
                    />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{t("nextSteps.inviteMore")}</ItemTitle>
                    <ItemDescription>
                      {t("nextSteps.inviteMoreDescription")}
                    </ItemDescription>
                  </ItemContent>
                </Item>
                <BorderBeam borderRadius={8}>
                  <Item variant="muted">
                    <ItemMedia variant="icon">
                      <Sparkles
                        className="text-muted-foreground"
                        aria-hidden="true"
                      />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{t("nextSteps.exploreAgents")}</ItemTitle>
                      <ItemDescription>
                        {t("nextSteps.exploreAgentsDescription")}
                      </ItemDescription>
                    </ItemContent>
                  </Item>
                </BorderBeam>
              </ItemGroup>
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
    </>
  )
}
