"use client"

import { useState, type ReactNode } from "react"

import { Button } from "@workspace/ui/components/button"
import { Heading } from "@workspace/ui/components/heading"
import { Text } from "@workspace/ui/components/text"
import { Check } from "@workspace/ui/lib/icons"

export interface OAuthConsentFormMessages {
  title: string
  /** Full sentence, e.g. "Cursor wants to access your Afframe account." */
  description: ReactNode
  scopesLabel: string
  /** Map a raw scope token to a human sentence. */
  scopeLabel: (scope: string) => string
  authorize: string
  authorizing: string
  deny: string
  denying: string
  failed: string
}

interface Props {
  messages: OAuthConsentFormMessages
  scopes: string[]
  clientUri?: string | null
  /**
   * Resolve the decision. On success it navigates away (the caller sets
   * `window.location`), so the returned promise settling to `false` means the
   * request failed and the form should surface the error.
   */
  onDecide: (accept: boolean) => Promise<boolean>
}

/**
 * OAuth 2.1 consent screen, rendered inside the shared auth shell (same chrome
 * as the login/signup steps). Presentational only: the caller owns the POST to
 * `/api/auth/oauth2/consent` and the redirect that follows.
 */
export function OAuthConsentForm({
  messages,
  scopes,
  clientUri,
  onDecide,
}: Props) {
  const [busy, setBusy] = useState<"accept" | "deny" | null>(null)
  const [failed, setFailed] = useState(false)

  async function decide(accept: boolean) {
    setBusy(accept ? "accept" : "deny")
    setFailed(false)
    try {
      const ok = await onDecide(accept)
      if (!ok) {
        setFailed(true)
        setBusy(null)
      }
      // On success the caller navigates away; keep the buttons disabled.
    } catch {
      setFailed(true)
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Heading level={2} className="mt-0">
          {messages.title}
        </Heading>
        <Text variant="muted">{messages.description}</Text>
        {clientUri ? (
          <Text variant="caption" className="break-all">
            {clientUri}
          </Text>
        ) : null}
      </header>

      {scopes.length > 0 ? (
        <div className="flex flex-col gap-3">
          <Text variant="small">{messages.scopesLabel}</Text>
          <ul className="flex flex-col gap-2">
            {scopes.map((scope) => (
              <li key={scope} className="flex items-start gap-2">
                <Check
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <Text variant="muted">{messages.scopeLabel(scope)}</Text>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {failed ? (
        <Text variant="small" className="text-destructive" role="alert">
          {messages.failed}
        </Text>
      ) : null}

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          size="xl"
          className="flex-1"
          disabled={busy !== null}
          onClick={() => void decide(false)}
        >
          {busy === "deny" ? messages.denying : messages.deny}
        </Button>
        <Button
          type="button"
          size="xl"
          className="flex-1"
          disabled={busy !== null}
          onClick={() => void decide(true)}
        >
          {busy === "accept" ? messages.authorizing : messages.authorize}
        </Button>
      </div>
    </div>
  )
}
