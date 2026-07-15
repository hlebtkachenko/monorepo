"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { ArchetypeDetails } from "@workspace/ui/blocks/archetypes"
import {
  sectionDetailsForm,
  sectionDetailsGroup,
  sectionDetailsTable,
  type SectionAction,
} from "@workspace/ui/blocks/content-panel"
import { toast } from "@workspace/ui/components/sonner"

import { revokeOwnApiKeyAction } from "../../../workspace/profile/actions"
import type { DangerPurpose } from "../../../workspace/profile/danger-actions"
import { DangerDialogs } from "./danger-zone"

const REVOKE_API_KEY = "profile.api-key.revoke"
const LEAVE_WORKSPACE = "profile.danger.leave"
const DELETE_ACCOUNT = "profile.danger.delete"

export interface ProfileSession {
  id: string
  device: string
  ip: string
  lastActive: string
  current: boolean
}

export interface ProfileSecurityApiKey {
  id: string
  name: string
  organization: string
  prefix: string
  scopes: string[]
  lastUsed: string
  revoked: boolean
}

export interface ProfileDangerAvailability {
  workspaceName: string | null
  leaveBlockedByOwnership: boolean
  deleteBlockedWorkspace: string | null
}

export function ProfileSecurity({
  twoFactorEnabled,
  sessions,
  apiKeys,
  danger,
}: {
  twoFactorEnabled: boolean
  sessions: ProfileSession[]
  apiKeys: ProfileSecurityApiKey[]
  danger: ProfileDangerAvailability
}) {
  const router = useRouter()
  const [revoking, setRevoking] = React.useState<string | null>(null)
  const [dangerPurpose, setDangerPurpose] =
    React.useState<DangerPurpose | null>(null)

  async function revoke(id: string) {
    setRevoking(id)
    const result = await revokeOwnApiKeyAction(id)
    setRevoking(null)
    if (result.ok) {
      toast.success("API key revoked")
      router.refresh()
    } else {
      toast.error("Could not revoke API key")
    }
  }

  function onSectionAction(action: SectionAction) {
    if (action.id === LEAVE_WORKSPACE) {
      setDangerPurpose("leave_workspace")
      return
    }
    if (action.id === DELETE_ACCOUNT) {
      setDangerPurpose("delete_account")
      return
    }
    if (
      action.id === REVOKE_API_KEY &&
      typeof action.payload === "object" &&
      action.payload !== null &&
      "rowId" in action.payload &&
      typeof action.payload.rowId === "string"
    ) {
      void revoke(action.payload.rowId)
    }
  }

  return (
    <>
      <ArchetypeDetails
        title="Profile security"
        breadcrumb={[{ label: "Profile", href: "/workspace/profile" }]}
        sections={[
          sectionDetailsGroup({
            title: "Authentication",
            sections: [
              sectionDetailsForm({
                title: "Account protection",
                description:
                  "Use two-factor authentication and secure account recovery.",
                fields: [
                  {
                    label: "Two-factor authentication",
                    span: 3,
                    control: {
                      kind: "text",
                      value: twoFactorEnabled ? "Enabled" : "Not set up",
                      disabled: true,
                    },
                  },
                  {
                    label: twoFactorEnabled
                      ? "Password"
                      : "Two-factor authentication",
                    span: 3,
                    control: {
                      kind: "action",
                      label: twoFactorEnabled
                        ? "Reset password"
                        : "Set up two-factor",
                      href: twoFactorEnabled
                        ? "/auth/forgot-password"
                        : "/auth/mfa/setup",
                    },
                  },
                  ...(twoFactorEnabled
                    ? []
                    : [
                        {
                          label: "Password",
                          span: 3 as const,
                          control: {
                            kind: "action" as const,
                            label: "Reset password",
                            href: "/auth/forgot-password",
                          },
                        },
                      ]),
                ],
              }),
            ],
          }),
          sectionDetailsGroup({
            title: "Connected access",
            sections: [
              sectionDetailsTable({
                title: "Recent devices and sessions",
                description: "Active sessions issued for this account.",
                mode: "readonly",
                emptyText: "No active sessions found.",
                columns: [
                  {
                    id: "device",
                    header: "Device",
                    span: 3,
                    control: { kind: "text" },
                  },
                  {
                    id: "ip",
                    header: "IP address",
                    control: { kind: "text" },
                  },
                  {
                    id: "lastActive",
                    header: "Last active",
                    span: 2,
                    control: { kind: "text" },
                  },
                ],
                rows: sessions.map((session) => ({
                  id: session.id,
                  cells: {
                    device: session.device,
                    ip: session.ip,
                    lastActive: session.current
                      ? `Current · ${session.lastActive}`
                      : session.lastActive,
                  },
                })),
              }),
              sectionDetailsTable({
                title: "API keys",
                description:
                  "Keys created by your account for organization integrations. Revocation takes effect immediately.",
                mode: "readonly",
                emptyText: "You have not created any API keys.",
                columns: [
                  {
                    id: "key",
                    header: "Key",
                    span: 2,
                    control: { kind: "text" },
                  },
                  {
                    id: "organization",
                    header: "Organization",
                    control: { kind: "text" },
                  },
                  {
                    id: "scopes",
                    header: "Scopes",
                    control: { kind: "text" },
                  },
                  {
                    id: "lastUsed",
                    header: "Last used",
                    control: { kind: "text" },
                  },
                ],
                rows: apiKeys.map((key) => ({
                  id: key.id,
                  actionDisabled: key.revoked,
                  actionBusy: revoking === key.id,
                  cells: {
                    key: `${key.name} · ${key.prefix} · ${key.revoked ? "Revoked" : "Active"}`,
                    organization: key.organization,
                    scopes: key.scopes.join(", ") || "No scopes",
                    lastUsed: key.lastUsed,
                  },
                })),
                rowAction: {
                  label: "Revoke key",
                  busyLabel: "Revoking…",
                  actionId: REVOKE_API_KEY,
                  variant: "destructive",
                  header: "Action",
                  confirmTitle: "Revoke this API key?",
                  confirmDescription:
                    "Integrations using this key lose access immediately. This cannot be undone.",
                  confirmLabel: "Revoke key",
                },
              }),
            ],
          }),
          sectionDetailsGroup({
            title: "Account actions",
            sections: [
              sectionDetailsForm({
                title: "Workspace and account",
                description:
                  "Both actions require an exact confirmation phrase and one-time email code.",
                fields: [
                  {
                    label: "Workspace access",
                    span: 3,
                    control: {
                      kind: "button",
                      label: "Leave workspace",
                      actionId: LEAVE_WORKSPACE,
                      variant: "destructive",
                    },
                  },
                  {
                    label: "Account",
                    span: 3,
                    control: {
                      kind: "button",
                      label: "Delete account",
                      actionId: DELETE_ACCOUNT,
                      variant: "destructive",
                    },
                  },
                ],
              }),
            ],
          }),
        ]}
        onSectionAction={onSectionAction}
      />
      <DangerDialogs
        purpose={dangerPurpose}
        onOpenChange={setDangerPurpose}
        workspaceName={danger.workspaceName}
        leaveBlockedByOwnership={danger.leaveBlockedByOwnership}
        deleteBlockedWorkspace={danger.deleteBlockedWorkspace}
      />
    </>
  )
}
