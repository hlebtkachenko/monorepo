"use client"

import { useState } from "react"
import { LogOut, KeyRound, ChevronDown } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

import {
  requestOwnPasswordResetAction,
  signOutAction,
} from "../_lib/account-actions"

interface Props {
  email: string
}

export function AccountMenu({ email }: Props) {
  const [sending, setSending] = useState(false)

  async function onResetClick() {
    if (sending) return
    setSending(true)
    const result = await requestOwnPasswordResetAction()
    setSending(false)
    if (result.ok) {
      toast.success("Reset link sent", {
        description: `Check ${result.email}. In dev with no Resend/SES configured, the link prints to the dev-server console — or visit /api/dev/outbox.`,
        duration: 10000,
      })
    } else {
      toast.error("Could not send reset email", {
        description: "Try again in a moment.",
        duration: 6000,
      })
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="justify-between gap-2">
          <span className="max-w-[160px] truncate">{email}</span>
          <ChevronDown className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Signed in</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={sending}
          onSelect={(e) => {
            e.preventDefault()
            void onResetClick()
          }}
        >
          <KeyRound className="size-4" aria-hidden="true" />
          <span>{sending ? "Sending…" : "Reset password"}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={signOutAction}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full cursor-pointer">
              <LogOut className="size-4" aria-hidden="true" />
              <span>Sign out</span>
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
