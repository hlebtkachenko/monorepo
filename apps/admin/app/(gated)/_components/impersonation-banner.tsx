import { AlertTriangle } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import type { ImpersonationState } from "@/lib/admin-impersonation-types"

export interface ImpersonationBannerProps {
  impersonation: ImpersonationState | null
}

function formatTime(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 19) + " UTC"
}

export function ImpersonationBanner({
  impersonation,
}: ImpersonationBannerProps) {
  if (!impersonation) return null

  return (
    <div className="text-destructive-foreground sticky top-0 z-50 border-b border-destructive bg-destructive/10">
      <div className="flex items-center gap-3 px-4 py-2 text-sm">
        <AlertTriangle className="size-4 text-destructive" aria-hidden />
        <span className="font-medium text-destructive">Impersonating</span>
        <span className="truncate">{impersonation.targetEmail}</span>
        <span className="hidden text-muted-foreground sm:inline">
          — reason:
        </span>
        <span className="hidden truncate sm:inline">
          {impersonation.reason}
        </span>
        <span className="hidden text-muted-foreground md:inline">— ends</span>
        <span className="hidden md:inline">
          {formatTime(impersonation.expectedEndAt)}
        </span>
        <form
          action="/api/admin/impersonation/stop"
          method="post"
          className="ml-auto"
        >
          <Button type="submit" variant="destructive" size="sm">
            Stop
          </Button>
        </form>
      </div>
    </div>
  )
}
