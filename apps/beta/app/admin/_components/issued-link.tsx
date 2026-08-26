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
 * A freshly minted one-time link, shown for the only time it will ever exist.
 *
 * The database holds `sha256(secret)`; the secret is in this component's props
 * and nowhere else. Navigating away, submitting the form again, or reloading
 * loses it — and the recovery is to ISSUE A NEW LINK, which is a two-click act
 * that also invalidates the lost one when it is consumed (the sibling sweep).
 *
 * So the copy affordance is not a nicety, it is the feature: the office user
 * has one chance to get this into whatever channel they are using. The URL is
 * also rendered in full and selectable, because `navigator.clipboard` is
 * unavailable in a non-secure context and a copy button that silently does
 * nothing would be worse than no button.
 */
export function IssuedLink({
  url,
  email,
  expiresAt,
}: Readonly<{ url: string; email: string; expiresAt: string }>) {
  const t = useBetaTranslations()
  const [copied, setCopied] = React.useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      // No clipboard permission or no secure context. The URL below is the
      // fallback and is always rendered, so there is nothing to recover from.
      setCopied(false)
    }
  }

  return (
    <Alert>
      <AlertTitle>{t("admin.linkIssuedTitle")}</AlertTitle>
      <AlertDescription className="grid gap-2">
        <span className="text-xs text-muted-foreground">
          {t("admin.linkIssuedOnce")}
        </span>
        <code className="block w-full overflow-x-auto rounded-md bg-muted px-2 py-1 font-mono text-xs break-all select-all">
          {url}
        </code>
        <span className="text-xs text-muted-foreground">
          {email} · {t("admin.linkExpiresAt")}{" "}
          {new Date(expiresAt).toLocaleString("cs-CZ")}
        </span>
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
