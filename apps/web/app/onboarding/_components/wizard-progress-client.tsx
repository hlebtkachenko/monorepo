"use client"

import { usePathname } from "next/navigation"

import { useTranslations } from "@workspace/i18n/client"
import { Progress } from "@workspace/ui/components/progress"
import type { StepKey } from "@workspace/shared/auth"

import { useOnboardingRole } from "./onboarding-role-context"
import {
  stepIndexForRole,
  stepsForRole,
  totalStepsForRole,
} from "../_lib/steps"

/**
 * Layout-owned progress meter. Reads the current pathname and derives
 * the step + total from the active role. Renders nothing if the
 * current pathname isn't a known step (e.g. transition flicker).
 */
export function WizardProgressClient() {
  const pathname = usePathname()
  const role = useOnboardingRole()
  const tShell = useTranslations("onboarding.shell")

  const step = stepFromPathname(pathname)
  if (!step) return null
  const allowed = stepsForRole(role)
  if (!allowed.includes(step)) return null

  const current = stepIndexForRole(role, step)
  const total = totalStepsForRole(role)
  const percent = Math.round((current / total) * 100)

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-muted-foreground">
        {tShell("stepIndicator", {
          current: String(current),
          total: String(total),
        })}
      </span>
      <Progress
        value={percent}
        className="h-1"
        aria-label={tShell("progressLabel")}
      />
    </div>
  )
}

function stepFromPathname(pathname: string): StepKey | null {
  const segments = pathname.split("/").filter(Boolean)
  // /onboarding/<step>
  if (segments[0] !== "onboarding") return null
  const candidate = segments[1]
  if (!candidate) return null
  const valid: StepKey[] = [
    "profile",
    "experience",
    "password",
    "workspace",
    "plan",
    "team",
    "done",
  ]
  return (valid as string[]).includes(candidate) ? (candidate as StepKey) : null
}
