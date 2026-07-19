"use client"

import { useEffect, type ReactNode } from "react"

import { Heading } from "@workspace/ui/components/heading"
import { Text } from "@workspace/ui/components/text"
import { Check } from "@workspace/ui/lib/icons"

export interface OAuthRedirectNoticeMessages {
  title: string
  /** e.g. "Returning you to Cursor…" */
  description: ReactNode
}

interface Props {
  messages: OAuthRedirectNoticeMessages
  /** Perform the actual navigation to the client callback. */
  onRedirect: () => void
  /** How long the branded notice shows before redirecting. */
  delayMs?: number
}

/**
 * Branded hand-off screen shown for a beat after the user authorizes, before
 * the browser leaves Afframe for the OAuth client's callback. Keeps the last
 * Afframe-controlled moment on-brand (same auth shell as consent/login) instead
 * of a bare white flash during the redirect. The client's own callback page
 * renders after this — that page belongs to the client, not to us.
 */
export function OAuthRedirectNotice({
  messages,
  onRedirect,
  delayMs = 1200,
}: Props) {
  useEffect(() => {
    const id = setTimeout(onRedirect, delayMs)
    return () => clearTimeout(id)
  }, [onRedirect, delayMs])

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <span
        className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary"
        aria-hidden="true"
      >
        <Check className="size-6" />
      </span>
      <header className="flex flex-col gap-2">
        <Heading level={2} className="mt-0">
          {messages.title}
        </Heading>
        <Text variant="muted">{messages.description}</Text>
      </header>
    </div>
  )
}
