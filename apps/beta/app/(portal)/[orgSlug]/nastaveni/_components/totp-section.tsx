"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

import { BackupCodes } from "@/app/_components/backup-codes"
import { TotpEnrolment } from "@/app/_components/totp-enrolment"
import type { BetaMessageKey } from "@/i18n/messages"
import { useBetaTranslations } from "@/i18n/translations"
import { betaAuthClient } from "@/lib/auth/client"

/**
 * Nastavení › Účet, 2FA block (spec §2.10: "Účet: profile, password, 2FA
 * (forced for owner)").
 *
 * Three states, one component:
 *   - not enrolled → the shared `TotpEnrolment` flow;
 *   - enrolled → regenerate backup codes, and disable;
 *   - enrolled AND under the office mandate → the same two controls, with the
 *     mandate stated. Disabling is not hidden: an owner is allowed to turn the
 *     factor off (to re-enrol on a new phone, which is the actual reason anyone
 *     does this), and the enforcement gate then sends them straight back to
 *     `/zabezpeceni`. A disabled button would make "my authenticator is on my
 *     old phone" an unrecoverable state without an operator.
 *
 * Every call carries the account password. Better Auth requires it
 * (`shouldRequirePassword`), and it is the right requirement: a stolen session
 * must not be able to strip the second factor off an account or mint itself a
 * fresh set of bypass codes.
 */
export function TotpSection({
  enabled,
  mandatory,
}: {
  enabled: boolean
  mandatory: boolean
}) {
  const t = useBetaTranslations()
  const router = useRouter()

  if (!enabled) {
    return (
      <div className="grid gap-3">
        {mandatory ? (
          <Alert>
            <AlertDescription>
              {t("nastaveni.totpMandatoryNotice")}
            </AlertDescription>
          </Alert>
        ) : null}
        <TotpEnrolment onEnrolled={() => router.refresh()} />
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <Alert>
        <AlertDescription>
          {t(
            mandatory
              ? "nastaveni.totpOnMandatory"
              : "nastaveni.totpOnOptional",
          )}
        </AlertDescription>
      </Alert>
      <RegenerateBackupCodes />
      <DisableTotp onDisabled={() => router.refresh()} />
    </div>
  )
}

function RegenerateBackupCodes() {
  const t = useBetaTranslations()
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<BetaMessageKey | null>(null)
  const [codes, setCodes] = React.useState<string[] | null>(null)
  const formRef = React.useRef<HTMLFormElement>(null)

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault()
    const password = String(
      new FormData(event.currentTarget).get("password") ?? "",
    )
    setError(null)
    setCodes(null)
    setPending(true)

    const result = await betaAuthClient.twoFactor.generateBackupCodes({
      password,
    })
    setPending(false)

    if (result.error || !result.data) {
      setError(
        result.error?.status === 429
          ? "auth.tooManyAttempts"
          : "nastaveni.errorPasswordWrong",
      )
      return
    }

    formRef.current?.reset()
    // Regenerating REPLACES the old set — the previous codes stop working the
    // moment this returns, which the warning inside `BackupCodes` states.
    setCodes(result.data.backupCodes)
  }

  return (
    <section className="grid gap-3 rounded-lg border border-border-subtle p-4">
      <h4 className="font-sans text-sm font-semibold text-foreground">
        {t("nastaveni.backupCodesTitle")}
      </h4>
      <p className="text-xs text-muted-foreground">
        {t("nastaveni.backupCodesHint")}
      </p>

      <form
        ref={formRef}
        onSubmit={(e) => void handleSubmit(e)}
        className="grid gap-3"
      >
        <div className="grid gap-1.5">
          <Label htmlFor="backup-password">
            {t("nastaveni.currentPassword")}
          </Label>
          <Input
            id="backup-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{t(error)}</AlertDescription>
          </Alert>
        ) : null}

        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={pending}
          className="justify-self-start"
        >
          {pending
            ? t("nastaveni.pending")
            : t("nastaveni.backupCodesRegenerate")}
        </Button>
      </form>

      {codes ? <BackupCodes codes={codes} /> : null}
    </section>
  )
}

function DisableTotp({ onDisabled }: { onDisabled: () => void }) {
  const t = useBetaTranslations()
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<BetaMessageKey | null>(null)

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault()
    const password = String(
      new FormData(event.currentTarget).get("password") ?? "",
    )
    setError(null)
    setPending(true)

    const result = await betaAuthClient.twoFactor.disable({ password })
    setPending(false)

    if (result.error) {
      setError(
        result.error.status === 429
          ? "auth.tooManyAttempts"
          : "nastaveni.errorPasswordWrong",
      )
      return
    }

    onDisabled()
  }

  return (
    <section className="grid gap-3 rounded-lg border border-destructive/40 p-4">
      <h4 className="font-sans text-sm font-semibold text-foreground">
        {t("nastaveni.totpDisableTitle")}
      </h4>
      <p className="text-xs text-muted-foreground">
        {t("nastaveni.totpDisableHint")}
      </p>

      <form onSubmit={(e) => void handleSubmit(e)} className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="totp-disable-password">
            {t("nastaveni.currentPassword")}
          </Label>
          <Input
            id="totp-disable-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{t(error)}</AlertDescription>
          </Alert>
        ) : null}

        <Button
          type="submit"
          variant="destructive"
          size="sm"
          disabled={pending}
          className="justify-self-start"
        >
          {pending ? t("nastaveni.pending") : t("nastaveni.totpDisable")}
        </Button>
      </form>
    </section>
  )
}
