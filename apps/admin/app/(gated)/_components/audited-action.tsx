"use client"

import { useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog"
import { Textarea } from "@workspace/ui/components/textarea"

export interface AuditedActionProps {
  action: string
  reason?: boolean
  confirm: { title: string; description: string }
  serverAction: (input: { reason?: string }) => Promise<{
    ok: boolean
    error?: string
  }>
  children: ReactNode
}

export function AuditedAction({
  action,
  reason: requireReason = false,
  confirm,
  serverAction,
  children,
}: AuditedActionProps) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [pending, startTransition] = useTransition()

  function handleConfirm() {
    if (requireReason && reason.trim().length < 8) {
      toast.error("Reason must be at least 8 characters")
      return
    }
    startTransition(async () => {
      const result = await serverAction({ reason: reason.trim() })
      if (result.ok) {
        toast.success(`${action} ok`)
        setOpen(false)
        setReason("")
      } else {
        toast.error(result.error ?? `${action} failed`)
      }
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirm.title}</AlertDialogTitle>
          <AlertDialogDescription>{confirm.description}</AlertDialogDescription>
        </AlertDialogHeader>
        {requireReason ? (
          <div className="flex flex-col gap-1">
            <label htmlFor="audited-reason" className="text-sm font-medium">
              Reason <span className="text-destructive">*</span>
            </label>
            <Textarea
              id="audited-reason"
              placeholder="At least 8 characters."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={8}
            />
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              handleConfirm()
            }}
            disabled={pending}
          >
            {pending ? "Working…" : "Confirm"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
