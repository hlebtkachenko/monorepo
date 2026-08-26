"use client"

import * as React from "react"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"

import { useBetaTranslations } from "@/i18n/translations"

/**
 * A freshly minted agent key, shown for the only time it will ever exist.
 *
 * The database holds `sha256(secret)`; the secret is in this component's props
 * and nowhere else. Navigating away, submitting the form again, or reloading
 * loses it — and the recovery is to ISSUE A NEW KEY and revoke this one, which
 * is two clicks.
 *
 * Rendered as `<code>`, never as a link: an autolinked credential is one
 * mis-click from a `Referer` header on somebody else's server.
 */
export function IssuedAgentKey({
  secret,
  label,
}: Readonly<{ secret: string; label: string }>) {
  const t = useBetaTranslations()
  const [copied, setCopied] = React.useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(secret)
      setCopied(true)
    } catch {
      // No clipboard permission or no secure context. The value below is always
      // rendered and selectable, so there is nothing to recover from.
      setCopied(false)
    }
  }

  return (
    <Alert>
      <AlertTitle>{t("admin.agentKeyIssuedTitle")}</AlertTitle>
      <AlertDescription className="grid gap-2">
        <span className="text-xs text-muted-foreground">
          {t("admin.agentKeyIssuedOnce")}
        </span>
        <code className="block w-full overflow-x-auto rounded-md bg-muted px-2 py-1 font-mono text-xs break-all select-all">
          {secret}
        </code>
        <span className="text-xs text-muted-foreground">{label}</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="justify-self-start"
          onClick={() => void copy()}
        >
          {copied ? t("admin.copied") : t("admin.copy")}
        </Button>
      </AlertDescription>
    </Alert>
  )
}
