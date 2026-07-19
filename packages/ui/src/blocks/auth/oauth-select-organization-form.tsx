"use client"

import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Heading } from "@workspace/ui/components/heading"
import { Text } from "@workspace/ui/components/text"

export interface OAuthSelectOrganizationOption {
  id: string
  legalName: string
  slug: string
}

export interface OAuthSelectOrganizationMessages {
  title: string
  description: string
  continuing: string
  empty: string
  failed: string
}

interface Props {
  messages: OAuthSelectOrganizationMessages
  organizations: OAuthSelectOrganizationOption[]
  /**
   * Persist the choice and resume the authorize flow. On success it navigates
   * away (the caller sets `window.location`); a settled `false` means the step
   * failed and the form should surface the error.
   */
  onSelect: (organizationId: string) => Promise<boolean>
}

/**
 * OAuth authorize org-selection step (postLogin.page), rendered inside the
 * shared auth shell. Users with more than one active organization pick which
 * one the issued token binds to. Presentational only: the caller owns the
 * persistence + resume.
 */
export function OAuthSelectOrganizationForm({
  messages,
  organizations,
  onSelect,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  async function choose(organizationId: string) {
    setBusy(organizationId)
    setFailed(false)
    try {
      const ok = await onSelect(organizationId)
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
      </header>

      {organizations.length === 0 ? (
        <Text variant="small" className="text-destructive" role="alert">
          {messages.empty}
        </Text>
      ) : (
        <ul className="flex flex-col gap-3">
          {organizations.map((org) => (
            <li key={org.id}>
              <Button
                type="button"
                variant="outline"
                size="xl"
                className="h-auto w-full flex-col items-start gap-0.5 py-4 text-left"
                disabled={busy !== null}
                onClick={() => void choose(org.id)}
              >
                <span className="font-medium">{org.legalName}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {busy === org.id ? messages.continuing : org.slug}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}

      {failed ? (
        <Text variant="small" className="text-destructive" role="alert">
          {messages.failed}
        </Text>
      ) : null}
    </div>
  )
}
