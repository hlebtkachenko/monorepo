"use client"

import { useRouter } from "next/navigation"

import { Button } from "@workspace/ui/components/button"

import { AuditedAction } from "@/app/(gated)/_components"

import { forceEndImpersonation } from "../actions"

export function ForceEndButton({ id }: { id: string }) {
  const router = useRouter()
  return (
    <AuditedAction
      action="admin.compliance.impersonation_force_ended"
      confirm={{
        title: "Force-end impersonation?",
        description:
          "This will set ended_at to now and revoke the impersonating staff member's elevated session.",
      }}
      serverAction={async () => {
        const result = await forceEndImpersonation({ id })
        if (result.ok) router.refresh()
        return result
      }}
    >
      <Button type="button" variant="destructive" size="sm">
        Force end
      </Button>
    </AuditedAction>
  )
}
