import type { ReactNode } from "react"
import { getTranslations } from "@workspace/i18n/server"

import {
  AuthShell,
  AuthShellAside,
  AuthShellBody,
  AuthShellFooter,
  AuthShellHeader,
  AuthShellLeft,
} from "@workspace/ui/blocks/auth-shell"
import {
  AuthAside,
  AuthAsideHeadline,
  AuthAsideQuote,
  AuthAsideSubtitle,
} from "@workspace/ui/blocks/auth-aside"
import { Progress } from "@workspace/ui/components/progress"

import { TOTAL_STEPS, type StepKey, stepIndex } from "../_lib/resume"

interface Props {
  step: StepKey
  children: ReactNode
  backHref?: string
  backLabel?: string
}

export async function OnboardingShell({
  step,
  children,
  backHref,
  backLabel,
}: Props) {
  const tBrand = await getTranslations("brand")
  const tShell = await getTranslations("onboarding.shell")
  const tAside = await getTranslations("auth.aside")

  const current = stepIndex(step)
  const percent = Math.round((current / TOTAL_STEPS) * 100)
  const brandName = tBrand("name")

  return (
    <AuthShell>
      <AuthShellLeft>
        <AuthShellHeader backHref={backHref} backLabel={backLabel}>
          <div className="flex items-center justify-between gap-4">
            <span className="text-base font-semibold tracking-tight">
              {brandName}
            </span>
            <span className="text-xs text-muted-foreground">
              {tShell("stepIndicator", {
                current: String(current),
                total: String(TOTAL_STEPS),
              })}
            </span>
          </div>
          <Progress
            value={percent}
            className="h-1"
            aria-label={tShell("progressLabel")}
          />
        </AuthShellHeader>
        <AuthShellBody>{children}</AuthShellBody>
        <AuthShellFooter>
          <span>
            © {new Date().getFullYear()} {brandName}
          </span>
        </AuthShellFooter>
      </AuthShellLeft>
      <AuthShellAside>
        <AuthAside variant="tone">
          <AuthAsideHeadline>{tAside("headline")}</AuthAsideHeadline>
          <AuthAsideSubtitle>{tAside("subtitle")}</AuthAsideSubtitle>
          <AuthAsideQuote
            author={tAside("quote.author")}
            role={tAside("quote.role")}
          >
            {tAside("quote.text")}
          </AuthAsideQuote>
        </AuthAside>
      </AuthShellAside>
    </AuthShell>
  )
}
