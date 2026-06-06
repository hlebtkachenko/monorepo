"use client"

import * as React from "react"
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
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Textarea } from "@workspace/ui/components/textarea"
import { CheckCircle2, Loader2, Send } from "@workspace/ui/lib/icons"
import { cn } from "@workspace/ui/lib/utils"

import {
  BUG_REPORT_TYPES,
  type BugReportType,
  type CapturedContext,
} from "../lib/capture-context"

type SubmitState = "idle" | "submitting" | "success" | "error"

interface BugReportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Type preselected when the dialog opens. Right-click → "bug"; the
   *  header "Send feedback" → "question" (labelled "Feedback"). */
  defaultType?: BugReportType
  /** Captured context snapshot for the right-click that opened this dialog. */
  context: CapturedContext | null
  /** Pre-fill for the reply-to email; usually the signed-in user's email. */
  defaultEmail?: string | null
  /**
   * Submit handler. Field names mirror the public Send-feedback API
   * (`type`, `message`, `email`) so the contract is stable across
   * future endpoint swaps. Throwing flips the dialog to error state.
   */
  onSubmit: (input: {
    type: BugReportType
    message: string
    email: string | null
    context: CapturedContext
  }) => Promise<{ url?: string; identifier?: string } | void>
}

const SUCCESS_AUTOCLOSE_MS = 1400
const MESSAGE_MAX = 4000
const EMAIL_MAX = 254

/**
 * Bug-report dialog opened from the right-click menu. Lets the user
 * pick a feedback type, write a message (1–4000 chars, required), and
 * optionally override the reply-to email. Submit kicks off the network
 * call and animates the Save button through idle → submitting →
 * success states, then auto-closes.
 */
export function BugReportDialog({
  open,
  onOpenChange,
  defaultType = "bug",
  context,
  defaultEmail,
  onSubmit,
}: BugReportDialogProps) {
  const [type, setType] = React.useState<BugReportType>(defaultType)
  const [message, setMessage] = React.useState("")
  const [email, setEmail] = React.useState<string>("")
  const [submitState, setSubmitState] = React.useState<SubmitState>("idle")
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)

  // Reset every time the dialog opens with a fresh context capture.
  React.useEffect(() => {
    if (open) {
      setType(defaultType)
      setMessage("")
      setEmail(defaultEmail ?? "")
      setSubmitState("idle")
      setErrorMessage(null)
    }
  }, [open, defaultType, defaultEmail])

  // Auto-close after a successful submission so the user sees the
  // green check briefly, then the dialog goes away on its own.
  React.useEffect(() => {
    if (submitState !== "success") return
    const timer = setTimeout(() => onOpenChange(false), SUCCESS_AUTOCLOSE_MS)
    return () => clearTimeout(timer)
  }, [submitState, onOpenChange])

  const trimmedMessage = message.trim()
  const messageValid =
    trimmedMessage.length >= 1 && trimmedMessage.length <= MESSAGE_MAX

  async function handleSubmit() {
    if (!context || submitState === "submitting" || !messageValid) return
    setSubmitState("submitting")
    setErrorMessage(null)
    try {
      await onSubmit({
        type,
        message: trimmedMessage,
        email: email.trim() ? email.trim() : null,
        context,
      })
      setSubmitState("success")
    } catch (err) {
      setSubmitState("error")
      setErrorMessage(err instanceof Error ? err.message : "Submission failed")
    }
  }

  const inputsDisabled = submitState !== "idle" && submitState !== "error"
  const submitDisabled =
    submitState === "submitting" ||
    submitState === "success" ||
    !context ||
    !messageValid

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Don't let Escape / overlay-click dismiss the dialog mid-submit
        // (the Close button is already disabled then) — the in-flight
        // request must resolve on the still-open dialog.
        if (submitState !== "submitting") onOpenChange(next)
      }}
    >
      <DialogContent data-slot="bug-report-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send feedback</DialogTitle>
          <DialogDescription>Page context is auto-attached.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="bug-report-type">Type</Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as BugReportType)}
              disabled={inputsDisabled}
            >
              <SelectTrigger id="bug-report-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUG_REPORT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="bug-report-message">Message</Label>
            <Textarea
              id="bug-report-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              disabled={inputsDisabled}
              maxLength={MESSAGE_MAX}
              required
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="bug-report-email">Reply email</Label>
            <Input
              id="bug-report-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={inputsDisabled}
              maxLength={EMAIL_MAX}
              autoComplete="email"
            />
          </div>

          {errorMessage && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {errorMessage}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              disabled={submitState === "submitting"}
            >
              Close
            </Button>
          </DialogClose>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitDisabled}
            className={cn(
              "min-w-24 transition-colors",
              submitState === "success" &&
                "bg-emerald-600 text-white hover:bg-emerald-600",
            )}
            data-state={submitState}
          >
            <SubmitButtonContent state={submitState} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SubmitButtonContent({ state }: { state: SubmitState }) {
  if (state === "submitting") {
    return (
      <>
        <Loader2 className="animate-spin" />
        Submitting
      </>
    )
  }
  if (state === "success") {
    return (
      <>
        <CheckCircle2 />
        Submitted
      </>
    )
  }
  return (
    <>
      <Send />
      Send feedback
    </>
  )
}
