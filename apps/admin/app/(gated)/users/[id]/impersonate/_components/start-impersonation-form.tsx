"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"

import { startImpersonation } from "@/lib/admin-impersonation"

const MIN_REASON_LENGTH = 8

export interface StartImpersonationFormProps {
  targetUserId: string
  targetEmail: string
}

/**
 * Client form that calls the `startImpersonation` server action with the
 * required reason (>= 8 chars). On success it refreshes the route so the
 * globally-rendered `ImpersonationBanner` picks up the new active row.
 */
export function StartImpersonationForm({
  targetUserId,
  targetEmail,
}: StartImpersonationFormProps) {
  const router = useRouter()
  const [reason, setReason] = useState("")
  const [pending, startTransition] = useTransition()

  function handleSubmit() {
    const trimmed = reason.trim()
    if (trimmed.length < MIN_REASON_LENGTH) {
      toast.error(`Reason must be at least ${MIN_REASON_LENGTH} characters`)
      return
    }
    startTransition(async () => {
      const result = await startImpersonation({
        targetUserId,
        reason: trimmed,
      })
      if (result.ok) {
        toast.success(`Impersonating ${targetEmail}`)
        setReason("")
        router.refresh()
      } else {
        toast.error(result.error ?? "Failed to start impersonation")
      }
    })
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        handleSubmit()
      }}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="impersonation-reason" className="text-sm font-medium">
          Reason <span className="text-destructive">*</span>
        </label>
        <Textarea
          id="impersonation-reason"
          placeholder="Why are you impersonating this user? Min 8 characters."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          minLength={MIN_REASON_LENGTH}
          rows={3}
          required
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">
          A 30-minute impersonation window opens. The reason is audited and
          shown in the global banner.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button
          type="submit"
          variant="default"
          disabled={pending || reason.trim().length < MIN_REASON_LENGTH}
        >
          {pending ? "Starting…" : "Start impersonation"}
        </Button>
      </div>
    </form>
  )
}
