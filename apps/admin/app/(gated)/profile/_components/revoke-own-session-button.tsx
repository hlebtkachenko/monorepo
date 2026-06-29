"use client"

import { Button } from "@workspace/ui/components/button"

import { AuditedAction } from "@/app/(gated)/_components"

import { revokeOwnSession } from "../actions"

export function RevokeOwnSessionButton({ sessionId }: { sessionId: string }) {
  return (
    <AuditedAction
      action="Revoke session"
      confirm={{
        title: "Sign this session out?",
        description: `Session ${sessionId.slice(0, 8)} will be deleted. If this is your current session you will be signed out.`,
      }}
      serverAction={() => revokeOwnSession({ session_id: sessionId })}
    >
      <Button variant="ghost" size="sm">
        Revoke
      </Button>
    </AuditedAction>
  )
}
