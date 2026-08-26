"use client"

import * as React from "react"

import { PasswordSchema } from "@workspace/shared/auth"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

import type { BetaMessageKey } from "@/i18n/messages"
import { useBetaTranslations } from "@/i18n/translations"
import { betaAuthClient } from "@/lib/auth/client"

/**
 * Nastavení › Účet, password block (spec §2.10).
 *
 * `revokeOtherSessions: true`, NOT A CHECKBOX. Better Auth makes it optional;
 * beta does not. The reason someone changes a password is that they think
 * someone else may know the old one, and leaving that someone's session alive is
 * the one outcome the change was meant to prevent. The setup-link reset path
 * already deletes every session for the same reason
 * (`lib/auth/setup-token.ts`), so this keeps the two ways to change a password
 * agreeing about what changing it means.
 *
 * Better Auth issues a NEW session token to this browser in the same response,
 * so the user stays signed in here and is signed out everywhere else — which is
 * why nothing below navigates away.
 *
 * The new password is validated against `@workspace/shared` `PasswordSchema`
 * before the call, the same schema the setup-link form uses and the same one
 * `emailAndPassword.minPasswordLength` mirrors — so a weak password fails at the
 * form with a Czech sentence instead of as an opaque endpoint error.
 */
export function PasswordForm() {
  const t = useBetaTranslations()
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<BetaMessageKey | null>(null)
  const [done, setDone] = React.useState(false)
  const formRef = React.useRef<HTMLFormElement>(null)

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const currentPassword = String(form.get("currentPassword") ?? "")
    const newPassword = String(form.get("newPassword") ?? "")

    setError(null)
    setDone(false)

    const parsed = PasswordSchema.safeParse(newPassword)
    if (!parsed.success) {
      setError(passwordErrorKey(parsed.error.issues))
      return
    }

    setPending(true)
    const result = await betaAuthClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    })
    setPending(false)

    if (result.error) {
      setError(
        result.error.status === 429
          ? "auth.tooManyAttempts"
          : "nastaveni.errorPasswordWrong",
      )
      return
    }

    // Both fields held a credential; neither has any further use.
    formRef.current?.reset()
    setDone(true)
  }

  return (
    <form
      ref={formRef}
      onSubmit={(e) => void handleSubmit(e)}
      className="grid gap-3"
    >
      <div className="grid gap-1.5">
        <Label htmlFor="password-current">
          {t("nastaveni.currentPassword")}
        </Label>
        <Input
          id="password-current"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="password-new">{t("nastaveni.newPassword")}</Label>
        <Input
          id="password-new"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
        />
        <p className="text-xs text-muted-foreground">
          {t("nastaveni.passwordRevokeHint")}
        </p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{t(error)}</AlertDescription>
        </Alert>
      ) : null}

      {done ? (
        <Alert>
          <AlertDescription>
            {t("nastaveni.okPasswordChanged")}
          </AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? t("nastaveni.pending") : t("nastaveni.savePassword")}
      </Button>
    </form>
  )
}

/**
 * `PasswordSchema` carries i18n slugs (`password.length`, …) as its issue
 * messages, which are exactly the keys in beta's own catalog — the same mapping
 * `app/(auth)/_actions/consume.ts` performs on the setup-link path.
 */
function passwordErrorKey(
  issues: readonly { message: string }[],
): BetaMessageKey {
  const slug = issues.find((issue) => issue.message.startsWith("password."))
  return (slug?.message ?? "password.length") as BetaMessageKey
}
