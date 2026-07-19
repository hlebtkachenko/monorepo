"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@workspace/ui/components/button"

/**
 * OAuth 2.1 consent screen. Better Auth redirects here (consentPage) with the
 * original authorize query; on a decision we POST it back verbatim as
 * `oauth_query` so the authorization server resumes the exact request, then
 * follow the returned `redirect_uri` (to the client, with a code or an error).
 */
export function ConsentForm({
  clientLabel,
  clientUri,
}: {
  clientLabel: string
  clientUri: string | null
}) {
  const search = useSearchParams()
  const scopes = (search.get("scope") ?? "").split(/\s+/).filter(Boolean)
  const [busy, setBusy] = useState<"accept" | "deny" | null>(null)
  const [failed, setFailed] = useState(false)

  async function decide(accept: boolean) {
    setBusy(accept ? "accept" : "deny")
    setFailed(false)
    try {
      const res = await fetch("/api/auth/oauth2/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ accept, oauth_query: search.toString() }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        redirect_uri?: string
      }
      if (data.redirect_uri) {
        window.location.href = data.redirect_uri
        return
      }
      setFailed(true)
      setBusy(null)
    } catch {
      setFailed(true)
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Authorize access</h1>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{clientLabel}</span>{" "}
          wants to access your Afframe account.
        </p>
        {clientUri ? (
          <p className="text-xs break-all text-muted-foreground">{clientUri}</p>
        ) : null}
      </div>

      {scopes.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">It will be able to:</p>
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {scopes.map((scope) => (
              <li
                key={scope}
                className="rounded-md bg-muted px-2 py-1 font-mono"
              >
                {scope}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {failed ? (
        <p role="alert" className="text-sm text-destructive">
          Something went wrong. Please try again.
        </p>
      ) : null}

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          disabled={busy !== null}
          onClick={() => void decide(false)}
        >
          {busy === "deny" ? "Denying…" : "Deny"}
        </Button>
        <Button
          type="button"
          className="flex-1"
          disabled={busy !== null}
          onClick={() => void decide(true)}
        >
          {busy === "accept" ? "Authorizing…" : "Authorize"}
        </Button>
      </div>
    </div>
  )
}
