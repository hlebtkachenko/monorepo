"use client"

import { useRouter } from "next/navigation"

import { Button } from "@workspace/ui/components/button"

import { AuditedAction } from "@/app/(gated)/_components"

import { revokeApiKey } from "../actions"

export interface RevokeApiKeyButtonProps {
  apiKeyId: string
  name: string
  prefix: string
}

export function RevokeApiKeyButton({
  apiKeyId,
  name,
  prefix,
}: RevokeApiKeyButtonProps) {
  const router = useRouter()
  return (
    <AuditedAction
      action="admin.dev.api_key_revoked"
      confirm={{
        title: `Revoke API key ${name}?`,
        description: `Key ${prefix} will be marked revoked. Any caller using it will start receiving 401 immediately.`,
      }}
      serverAction={async () => {
        const result = await revokeApiKey({ api_key_id: apiKeyId })
        if (result.ok) router.refresh()
        return result
      }}
    >
      <Button type="button" variant="destructive" size="sm">
        Revoke
      </Button>
    </AuditedAction>
  )
}
