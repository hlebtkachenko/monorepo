"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { toast } from "@workspace/ui/components/sonner"

import {
  confirmDeleteAccountAction,
  confirmLeaveWorkspaceAction,
  requestDangerOtpAction,
  type DangerPurpose,
} from "../../../workspace/profile/danger-actions"

interface ConfirmationState {
  phrase: string
  code: string
  codeSent: boolean
  busy: boolean
}

const EMPTY_STATE: ConfirmationState = {
  phrase: "",
  code: "",
  codeSent: false,
  busy: false,
}

const PHRASES: Record<DangerPurpose, string> = {
  leave_workspace: "LEAVE WORKSPACE",
  delete_account: "DELETE MY ACCOUNT",
}

function errorMessage(
  errorKey: string | undefined,
  retryAfter?: number,
): string {
  switch (errorKey) {
    case "transferWorkspaceOwnership":
      return "Transfer workspace ownership before continuing."
    case "otpCooldown":
      return `Wait ${retryAfter ?? 60} seconds before requesting another code.`
    case "otpInvalid":
      return "Code is invalid, expired, or already used."
    case "confirmationPhraseInvalid":
      return "Enter confirmation phrase exactly as shown."
    case "sessionExpired":
      return "Session expired. Sign in again."
    default:
      return "Action could not be completed."
  }
}

export function DangerDialogs({
  purpose,
  onOpenChange,
  workspaceName,
  leaveBlockedByOwnership,
  deleteBlockedWorkspace,
}: {
  purpose: DangerPurpose | null
  onOpenChange: (purpose: DangerPurpose | null) => void
  workspaceName: string | null
  leaveBlockedByOwnership: boolean
  deleteBlockedWorkspace: string | null
}) {
  const [states, setStates] = React.useState<
    Record<DangerPurpose, ConfirmationState>
  >({
    leave_workspace: { ...EMPTY_STATE },
    delete_account: { ...EMPTY_STATE },
  })

  const selectedPurpose = purpose ?? "leave_workspace"
  const state = states[selectedPurpose]
  const phrase = PHRASES[selectedPurpose]
  const phraseMatches = state.phrase === phrase
  const deleteAccount = selectedPurpose === "delete_account"
  const blocked = deleteAccount
    ? deleteBlockedWorkspace !== null
    : leaveBlockedByOwnership || workspaceName === null

  function patchState(patch: Partial<ConfirmationState>) {
    setStates((current) => ({
      ...current,
      [selectedPurpose]: { ...current[selectedPurpose], ...patch },
    }))
  }

  function setOpen(open: boolean) {
    if (state.busy) return
    if (!open) {
      setStates((current) => ({
        ...current,
        [selectedPurpose]: { ...EMPTY_STATE },
      }))
      onOpenChange(null)
    }
  }

  async function requestCode() {
    patchState({ busy: true })
    const result = await requestDangerOtpAction(selectedPurpose)
    patchState({ busy: false, codeSent: result.ok || state.codeSent })
    if (result.ok) {
      toast.success("One-time code sent to your email")
    } else {
      toast.error(errorMessage(result.errorKey, result.retryAfterSeconds))
    }
  }

  async function confirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    patchState({ busy: true })
    const result = deleteAccount
      ? await confirmDeleteAccountAction(state.phrase, state.code)
      : await confirmLeaveWorkspaceAction(state.phrase, state.code)
    if (!result.ok) {
      patchState({ busy: false })
      toast.error(errorMessage(result.errorKey, result.retryAfterSeconds))
      return
    }
    window.location.assign(deleteAccount ? "/auth/login" : "/workspace")
  }

  const title = deleteAccount ? "Delete account" : "Leave workspace"
  const description = deleteAccount
    ? "Permanently removes login access, sessions, memberships, API access, avatar, signature, and personal profile data. Legally required accounting and audit records retain an anonymized Deleted user identity."
    : `Removes access to ${workspaceName ?? "active workspace"} and every company inside it. Account remains active.`

  return (
    <Dialog open={purpose !== null} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={(event) => void confirm(event)} className="contents">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {blocked ? (
            <div className="grid gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm text-destructive">
                {deleteAccount
                  ? `Transfer ownership of ${deleteBlockedWorkspace ?? "workspace"} before deleting account.`
                  : "Transfer workspace ownership before leaving."}
              </p>
              <Button asChild variant="outline" className="w-fit">
                <Link href="/workspace/team">Manage workspace roles</Link>
              </Button>
            </div>
          ) : (
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={`${selectedPurpose}_phrase`}>
                  Type {phrase}
                </FieldLabel>
                <Input
                  id={`${selectedPurpose}_phrase`}
                  name={`${selectedPurpose}_phrase`}
                  value={state.phrase}
                  placeholder={phrase}
                  autoComplete="off"
                  disabled={state.busy}
                  onChange={(event) =>
                    patchState({ phrase: event.target.value })
                  }
                />
                <FieldDescription>
                  Exact phrase required before code can be sent.
                </FieldDescription>
              </Field>
              <div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!phraseMatches || state.busy}
                  onClick={() => void requestCode()}
                >
                  {state.busy
                    ? "Sending…"
                    : state.codeSent
                      ? "Send another code"
                      : "Send one-time code"}
                </Button>
              </div>
              {state.codeSent ? (
                <Field>
                  <FieldLabel htmlFor={`${selectedPurpose}_code`}>
                    One-time code
                  </FieldLabel>
                  <Input
                    id={`${selectedPurpose}_code`}
                    name={`${selectedPurpose}_code`}
                    value={state.code}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    disabled={state.busy}
                    onChange={(event) =>
                      patchState({
                        code: event.target.value.replace(/\D/g, "").slice(0, 6),
                      })
                    }
                  />
                </Field>
              ) : null}
            </FieldGroup>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={state.busy}>
                Cancel
              </Button>
            </DialogClose>
            {!blocked && state.codeSent ? (
              <Button
                type="submit"
                variant="destructive"
                disabled={
                  !phraseMatches || !/^\d{6}$/.test(state.code) || state.busy
                }
              >
                {state.busy
                  ? "Confirming…"
                  : deleteAccount
                    ? "Delete account permanently"
                    : "Leave workspace"}
              </Button>
            ) : null}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
