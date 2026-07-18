"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"

import { startImpersonation } from "@/lib/admin-impersonation"

const MIN_REASON_LENGTH = 8

export interface SignInToOrgFormProps {
  organizationId: string
  /** Responsible user (else owner) to impersonate; null when neither exists. */
  targetUserId: string | null
  targetEmail: string | null
  /** How the target was resolved, for the operator's context. */
  targetRole: "responsible" | "owner" | null
  /** True when the org currently grants support access (consent window open). */
  grantActive: boolean
}

/**
 * Org-scoped "Sign in to this org" control. Reuses the existing impersonation
 * subsystem (`startImpersonation`) — no separate login — but always passes the
 * `organizationId`, so the server enforces the support-access consent gate and
 * stamps `impersonation.organization_id`. The button is disabled unless the org
 * has an active grant and a resolvable target user; the server re-checks the
 * grant regardless (defense-in-depth).
 */
export function SignInToOrgForm({
  organizationId,
  targetUserId,
  targetEmail,
  targetRole,
  grantActive,
}: SignInToOrgFormProps) {
  const router = useRouter()
  const [reason, setReason] = useState("")
  const [pending, startTransition] = useTransition()

  const disabled = !grantActive || !targetUserId

  function handleSubmit() {
    if (!targetUserId) return
    const trimmed = reason.trim()
    if (trimmed.length < MIN_REASON_LENGTH) {
      toast.error(`Reason must be at least ${MIN_REASON_LENGTH} characters`)
      return
    }
    startTransition(async () => {
      const result = await startImpersonation({
        targetUserId,
        reason: trimmed,
        organizationId,
      })
      if (result.ok) {
        toast.success(`Signed in to this org as ${targetEmail ?? targetUserId}`)
        setReason("")
        router.refresh()
      } else {
        toast.error(result.error ?? "Failed to sign in to this org")
      }
    })
  }

  if (!targetUserId) {
    return (
      <p className="text-sm text-muted-foreground">
        No responsible user or owner to sign in as. Assign a responsible user or
        an owner first.
      </p>
    )
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        handleSubmit()
      }}
    >
      <p className="text-xs text-muted-foreground">
        Signs in as the {targetRole === "owner" ? "org owner" : "responsible"}{" "}
        user <span className="font-mono">{targetEmail ?? targetUserId}</span>{" "}
        via a 30-minute impersonation window. Requires an active support-access
        grant from the org.
      </p>
      <div className="flex flex-col gap-1">
        <label htmlFor="sign-in-org-reason" className="text-sm font-medium">
          Reason <span className="text-destructive">*</span>
        </label>
        <Textarea
          id="sign-in-org-reason"
          placeholder="Why are you signing in to this org? Min 8 characters."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          minLength={MIN_REASON_LENGTH}
          rows={3}
          required
          disabled={pending || disabled}
        />
      </div>
      <div className="flex items-center gap-3">
        <Button
          type="submit"
          variant="default"
          disabled={
            pending || disabled || reason.trim().length < MIN_REASON_LENGTH
          }
        >
          {pending ? "Signing in…" : "Sign in to this org"}
        </Button>
        {!grantActive ? (
          <span className="text-xs text-muted-foreground">
            Organization has not granted support access.
          </span>
        ) : null}
      </div>
    </form>
  )
}
