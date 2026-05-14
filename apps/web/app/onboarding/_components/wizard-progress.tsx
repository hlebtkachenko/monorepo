import { Progress } from "@workspace/ui/components/progress"
import { getTranslations } from "@workspace/i18n/server"

/**
 * Per-step progress meter rendered at the top of every onboarding form
 * column. The chrome (logo header, footer, aside) is owned by the route
 * group layouts (`(owner)/layout.tsx`, `member/layout.tsx`); only the
 * progress bar is page-specific because `current` changes per step.
 */
export async function WizardProgress({
  current,
  total,
}: {
  current: number
  total: number
}) {
  const tShell = await getTranslations("onboarding.shell")
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
