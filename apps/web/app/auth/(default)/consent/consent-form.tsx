"use client"

import { useCallback, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "@workspace/i18n/client"
import {
  OAuthConsentForm,
  OAuthRedirectNotice,
} from "@workspace/ui/blocks/auth"

/**
 * True when `url` leaves this origin — i.e. the final hand-off to the OAuth
 * client's callback, rather than an internal next step (e.g. the consent page
 * after org selection). Only the leaving-Afframe hop earns the branded notice.
 */
function isExternalTarget(url: string): boolean {
  if (url.startsWith("/")) return false
  try {
    return new URL(url).origin !== window.location.origin
  } catch {
    return false
  }
}

/**
 * OAuth 2.1 consent screen. Better Auth redirects here (consentPage) with the
 * original authorize query; on a decision we POST it back verbatim as
 * `oauth_query` so the authorization server resumes the exact request, then
 * follow the returned `url` (to the client, with a code or an error).
 *
 * On an accepted authorization the last on-brand moment before the browser
 * leaves for the client callback is a short `OAuthRedirectNotice`; denials and
 * internal next steps redirect immediately.
 *
 * Presentational shell + copy come from `@workspace/ui/blocks/auth` + i18n;
 * this wrapper owns the network round-trip only.
 */
export function ConsentForm({
  clientLabel,
  clientUri,
}: {
  clientLabel: string
  clientUri: string | null
}) {
  const search = useSearchParams()
  const t = useTranslations("auth.oauth.consent")
  const tRedirect = useTranslations("auth.oauth.redirecting")
  const tBrand = useTranslations("brand")
  const scopes = (search.get("scope") ?? "").split(/\s+/).filter(Boolean)
  const [pendingRedirect, setPendingRedirect] = useState<string | null>(null)

  const scopeLabels: Record<string, string> = {
    openid: t("scope.openid"),
    profile: t("scope.profile"),
    email: t("scope.email"),
    offline_access: t("scope.offlineAccess"),
    "accounting:read": t("scope.accountingRead"),
    "accounting:write": t("scope.accountingWrite"),
  }

  async function decide(accept: boolean): Promise<boolean> {
    const res = await fetch("/api/auth/oauth2/consent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ accept, oauth_query: search.toString() }),
    })
    // Better Auth returns `{ redirect: true, url }` (better-call serializes the
    // handler's plain object verbatim — there is no `redirect_uri` field). Read
    // `url`; keep `redirect_uri` as a defensive fallback across BA versions.
    const data = (await res.json().catch(() => ({}))) as {
      url?: string
      redirect_uri?: string
    }
    const target = data.url ?? data.redirect_uri
    if (!target) return false
    // Accepted + leaving Afframe: show the branded hand-off, then redirect.
    if (accept && isExternalTarget(target)) {
      setPendingRedirect(target)
      return true
    }
    window.location.href = target
    return true
  }

  const redirectNow = useCallback(() => {
    if (pendingRedirect) window.location.assign(pendingRedirect)
  }, [pendingRedirect])

  if (pendingRedirect) {
    return (
      <OAuthRedirectNotice
        messages={{
          title: tRedirect("title"),
          description: tRedirect("description", { client: clientLabel }),
        }}
        onRedirect={redirectNow}
      />
    )
  }

  return (
    <OAuthConsentForm
      scopes={scopes}
      clientUri={clientUri}
      onDecide={decide}
      messages={{
        title: t("title"),
        description: t("description", {
          client: clientLabel,
          brand: tBrand("name"),
        }),
        scopesLabel: t("scopesLabel"),
        scopeLabel: (scope) =>
          scopeLabels[scope] ?? t("scopeFallback", { scope }),
        authorize: t("authorize"),
        authorizing: t("authorizing"),
        deny: t("deny"),
        denying: t("denying"),
        failed: t("failed"),
      }}
    />
  )
}
