"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"

import { toggleFeatureFlag } from "@/app/(gated)/_actions/feature-flags"

interface Props {
  flagKey: string
  enabled: boolean
  returnPath: string
}

/**
 * Confirms before flipping a kill-switch flag. The server action enforces
 * twofa step-up on its own — this UI only adds a human "are you sure?"
 * step that catches misclicks before we make a round-trip to step-up.
 */
export function KillSwitchToggle({ flagKey, enabled, returnPath }: Props) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)

  if (!confirming) {
    return (
      <Button
        variant={enabled ? "outline" : "destructive"}
        size="sm"
        onClick={() => setConfirming(true)}
      >
        {enabled ? "Deactivate" : "Activate"}
      </Button>
    )
  }

  async function commit() {
    setPending(true)
    try {
      const r = await toggleFeatureFlag({
        key: flagKey,
        enabled: !enabled,
        returnPath,
      })
      if (r.ok) {
        toast.success(`${flagKey} ${!enabled ? "ACTIVATED" : "deactivated"}`)
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
        size="sm"
        onClick={() => setConfirming(false)}
        disabled={pending}
      >
        Cancel
      </Button>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => void commit()}
        disabled={pending}
      >
        {pending ? "Working…" : enabled ? "Yes, deactivate" : "Yes, ACTIVATE"}
      </Button>
    </div>
  )
}
