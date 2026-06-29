"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"

import { toggleFeatureFlag } from "@/app/(gated)/_actions/feature-flags"

const FLAG_KEY = "maintenance.lockdown"

interface Props {
  enabled: boolean
  returnPath: string
}

/**
 * Two-step toggle (preview → confirm) before flipping maintenance mode.
 * Step-up is enforced server-side in `toggleFeatureFlag` because the key
 * matches `KILL_SWITCH_FLAG_PREFIXES`.
 */
export function MaintenanceToggle({ enabled, returnPath }: Props) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)

  if (!confirming) {
    return (
      <Button
        variant={enabled ? "outline" : "destructive"}
        onClick={() => setConfirming(true)}
      >
        {enabled ? "Resume traffic" : "Engage maintenance"}
      </Button>
    )
  }

  async function commit() {
    setPending(true)
    try {
      const r = await toggleFeatureFlag({
        key: FLAG_KEY,
        enabled: !enabled,
        returnPath,
      })
      if (r.ok) {
        toast.success(
          enabled ? "Maintenance lifted" : "Maintenance mode ENGAGED",
        )
        router.refresh()
      } else {
        toast.error(r.error)
      }
    } catch (err) {
      if (
        err &&
        typeof err === "object" &&
        "digest" in err &&
        typeof (err as { digest?: unknown }).digest === "string" &&
        (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
      ) {
        throw err
      }
      toast.error((err as Error).message)
    } finally {
      setPending(false)
      setConfirming(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        onClick={() => setConfirming(false)}
        disabled={pending}
      >
        Cancel
      </Button>
      <Button
        variant="destructive"
        onClick={() => void commit()}
        disabled={pending}
      >
        {pending
          ? "Working…"
          : enabled
            ? "Yes, resume traffic"
            : "Yes, ENGAGE maintenance"}
      </Button>
    </div>
  )
}
