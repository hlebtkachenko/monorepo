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
 * A freshly minted invite link, shown for the only time it will ever exist —
 * the client-tier twin of `app/admin/_components/issued-link.tsx`.
 *
 * The database holds `sha256(token)`; the secret is in this component's props
 * and nowhere else. It is never logged (a log line naming a setup link is a
 * credential in a log aggregator), never redirected through, and not
 * re-derivable. Navigating away, submitting again or reloading loses it, and
 * the recovery is to ISSUE A NEW LINK — a two-click act that also invalidates
 * the lost one when the new one is consumed (the sibling sweep, migration 0001).
 *
 * So the copy affordance is not a nicety, it is the feature: the admin has one
 * chance to get this into whatever channel they are using. The URL is ALSO
 * rendered in full and selectable, because `navigator.clipboard` is unavailable
 * in a non-secure context and a copy button that silently does nothing would be
 * worse than no button at all.
 *
 * WHY THIS IS NOT THE /admin COMPONENT IMPORTED. It would be one import across
 * a boundary the app otherwise keeps closed: `app/admin/**` is the office's
 * cross-org area and `app/(portal)/**` is the client's, and the two share
 * `packages/ui` primitives and nothing else. Twenty lines of duplicated markup
 * is the cheaper half of that trade — and it lets this copy speak to a company
 * admin ("pošlete odkaz kolegovi") rather than to an accountant.
 */
export function IssuedInviteLink({
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
      // No clipboard permission or no secure context. The URL below is always
      // rendered, so there is nothing to recover from.
      setCopied(false)
    }
  }

  return (
    <Alert>
      <AlertTitle>{t("nastaveni.inviteIssuedTitle")}</AlertTitle>
      <AlertDescription className="grid gap-2">
        <span className="text-xs text-muted-foreground">
          {t("nastaveni.inviteIssuedOnce")}
        </span>
        <code className="block w-full overflow-x-auto rounded-md bg-muted px-2 py-1 font-mono text-xs break-all select-all">
          {url}
        </code>
        <span className="text-xs text-muted-foreground">
          {email} · {t("nastaveni.inviteExpiresAt")}{" "}
          {new Date(expiresAt).toLocaleString("cs-CZ")}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="justify-self-start"
          onClick={() => void copy()}
        >
          {copied ? t("nastaveni.copied") : t("nastaveni.copy")}
        </Button>
      </AlertDescription>
    </Alert>
  )
}
