"use client"

import { useSearchParams } from "next/navigation"
import { useTranslations } from "@workspace/i18n/client"
import { OAuthConsentForm } from "@workspace/ui/blocks/auth"

/**
 * OAuth 2.1 consent screen. Better Auth redirects here (consentPage) with the
 * original authorize query; on a decision we POST it back verbatim as
 * `oauth_query` so the authorization server resumes the exact request, then
 * follow the returned `redirect_uri` (to the client, with a code or an error).
 *
 * Presentational shell + copy come from `OAuthConsentForm` + i18n; this wrapper
 * owns the network round-trip only.
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
  const tBrand = useTranslations("brand")
  const scopes = (search.get("scope") ?? "").split(/\s+/).filter(Boolean)

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
    const data = (await res.json().catch(() => ({}))) as {
      redirect_uri?: string
    }
    if (data.redirect_uri) {
      window.location.href = data.redirect_uri
      return true
    }
    return false
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
