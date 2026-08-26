"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

import type { BetaMessageKey } from "@/i18n/messages"
import { useBetaTranslations } from "@/i18n/translations"
import { betaAuthClient } from "@/lib/auth/client"

/**
 * Nastavení › Účet, profile block: the display name is editable, the e-mail is
 * not (spec §2.10 "Účet: profile, password, 2FA, locale (cs)").
 *
 * WHY THE NAME GOES THROUGH BETTER AUTH'S HTTP ENDPOINT AND NOT A SERVER
 * ACTION. `app_user` is the one table in this app whose writes are fenced by an
 * AST test (`lib/auth/app-user-writes.boundary.test.ts`, SF-3): a Drizzle
 * `update(app_user).set(...)` or an `internalAdapter.updateUser(...)` in app
 * code must go through an audited payload builder, and `updateUser`'s allowlist
 * is deliberately EMPTY — no legitimate caller existed, and PR 21 is not a
 * reason to open one. `/update-user` needs no builder because the payload never
 * passes through this repo: Better Auth's own handler filters the body against
 * its declared user schema (`parseUserInput`), which knows about `name` and
 * `image` and drops everything else — so `is_staff`, `disabled_at` and
 * `two_factor_enabled` are unreachable from this form by construction, which is
 * exactly what SF-3 is protecting.
 *
 * It also means the write is rate-limited (`/update-user` in
 * `BETA_RATE_LIMIT_RULES`) and re-authenticated against the session cookie by
 * the same code path every other credential operation uses.
 *
 * E-MAIL IS READ-ONLY, and not because it is hard. It is the identity a setup
 * link was issued against and the key the office knows a person by; changing it
 * from a self-service form would silently re-point an invite trail. If it ever
 * needs to change, that is an /admin act.
 */
export function AccountProfileForm({
  name,
  email,
}: {
  name: string
  email: string
}) {
  const t = useBetaTranslations()
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<BetaMessageKey | null>(null)
  const [saved, setSaved] = React.useState(false)

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault()
    const nextName = String(
      new FormData(event.currentTarget).get("name") ?? "",
    ).trim()
    setError(null)
    setSaved(false)

    if (nextName.length === 0) {
      setError("nastaveni.errorNameRequired")
      return
    }

    setPending(true)
    const result = await betaAuthClient.updateUser({ name: nextName })
    setPending(false)

    if (result.error) {
      setError(
        result.error.status === 429
          ? "auth.tooManyAttempts"
          : "nastaveni.errorNotSaved",
      )
      return
    }

    setSaved(true)
    // The name is rendered by the server (the account menu, this page's own
    // heading), so the new value only appears after a re-render.
    router.refresh()
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="account-name">{t("nastaveni.accountName")}</Label>
        <Input
          id="account-name"
          name="name"
          defaultValue={name}
          autoComplete="name"
          required
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="account-email">{t("nastaveni.accountEmail")}</Label>
        <Input id="account-email" value={email} readOnly disabled />
        <p className="text-xs text-muted-foreground">
          {t("nastaveni.accountEmailHint")}
        </p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{t(error)}</AlertDescription>
        </Alert>
      ) : null}

      {saved ? (
        <Alert>
          <AlertDescription>{t("nastaveni.okSaved")}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? t("nastaveni.pending") : t("nastaveni.saveProfile")}
      </Button>
    </form>
  )
}
