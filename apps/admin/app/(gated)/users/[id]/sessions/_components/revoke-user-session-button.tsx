"use client"

import { Button } from "@workspace/ui/components/button"

import { AuditedAction } from "@/app/(gated)/_components"

import { revokeUserSession } from "../actions"

export function RevokeUserSessionButton({
  sessionId,
  userId,
  userEmail,
}: {
  sessionId: string
  userId: string
  userEmail: string
}) {
  return (
    <AuditedAction
      action="admin.user.session_revoked"
      confirm={{
        title: "Revoke this session?",
        description: `Session ${sessionId.slice(0, 8)} for ${userEmail} will be deleted. The user will be signed out on next request.`,
      }}
      serverAction={() =>
        revokeUserSession({ session_id: sessionId, user_id: userId })
      }
    >
      <Button type="button" variant="destructive" size="sm">
        Revoke
      </Button>
    </AuditedAction>
  )
}
