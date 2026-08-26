"use client"

import * as React from "react"

import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { QRCode, QRCodeSvg } from "@workspace/ui/components/qr-code"

import type { BetaMessageKey } from "@/i18n/messages"
import { useBetaTranslations } from "@/i18n/translations"
import { betaAuthClient } from "@/lib/auth/client"

import { BackupCodes } from "./backup-codes"

/**
 * TOTP enrolment — the two-step flow, shared by Nastavení › Účet (voluntary)
 * and `/zabezpeceni` (the forced screen an office account lands on).
 *
 * SHARED (`app/_components/`) rather than owned by one route, because those two
 * consumers must not drift: the forced screen is the one an owner MUST complete,
 * and a second implementation of it is a second place for the "enrolled" state
 * to be wrong.
 *
 * Everything here goes through the Better Auth HTTP surface via
 * `betaAuthClient`, never a Server Action. That is the same decision the sign-in
 * form documents: the rate limiter lives inside Better Auth's handler
 * (`/two-factor/enable` and `/two-factor/verify-totp` both have budgets in
 * `BETA_RATE_LIMIT_RULES`), and a server-side `auth.api.*` call would skip it.
 *
 * THE TWO STEPS ARE NOT OPTIONAL. `enable` generates a secret and returns it
 * with the backup codes; the factor does NOT count until `verifyTotp` proves the
 * human actually stored it (`two_factor.verified`, `skipVerificationOnEnable`
 * left off in `lib/auth/server.ts`). Collapsing them would enrol people against
 * secrets they failed to save, and the next sign-in is the first time anyone
 * finds out.
 *
 * QR IMAGE: `@workspace/ui/components/qr-code` already wraps the `qrcode`
 * package as a `@workspace/ui` production dependency (see the main app's
 * `apps/web/app/auth/mfa/setup/mfa-setup-form.tsx`, which uses the identical
 * `<QRCode><QRCodeSvg /></QRCode>` pattern), so rendering one here is not a
 * new runtime dependency. The `otpauth://` link and the manual-entry secret
 * below stay as the fallback path for a phone without a camera on the setup
 * screen.
 *
 * THE SECRET AND THE BACKUP CODES ARE NEVER LOGGED, never sent anywhere but the
 * screen, and never persisted client-side. They exist in this component's state
 * for the length of the enrolment and are dropped when it finishes.
 */
export function TotpEnrolment({
  onEnrolled,
  submitLabelKey = "nastaveni.totpEnable",
}: {
  /** Called after `verifyTotp` succeeds — the caller decides where to go next. */
  onEnrolled: () => void
  submitLabelKey?: BetaMessageKey
}) {
  const t = useBetaTranslations()
  const [step, setStep] = React.useState<"password" | "verify">("password")
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<BetaMessageKey | null>(null)
  const [enrolment, setEnrolment] = React.useState<{
    totpURI: string
    backupCodes: string[]
  } | null>(null)

  async function handleEnable(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault()
    const password = String(
      new FormData(event.currentTarget).get("password") ?? "",
    )
    setError(null)
    setPending(true)

    const result = await betaAuthClient.twoFactor.enable({ password })
    setPending(false)

    if (result.error || !result.data) {
      setError(
        result.error?.status === 429
          ? "auth.tooManyAttempts"
          : "nastaveni.errorPasswordWrong",
      )
      return
    }

    setEnrolment({
      totpURI: result.data.totpURI,
      backupCodes: result.data.backupCodes,
    })
    setStep("verify")
  }

  async function handleVerify(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault()
    const code = String(new FormData(event.currentTarget).get("code") ?? "")
    setError(null)
    setPending(true)

    const result = await betaAuthClient.twoFactor.verifyTotp({ code })
    setPending(false)

    if (result.error) {
      setError(
        result.error.status === 429
          ? "auth.tooManyAttempts"
          : "nastaveni.errorCodeWrong",
      )
      return
    }

    // Drop the secret and the codes from memory the moment they stop being
    // needed — the codes were shown once, which is the whole contract.
    setEnrolment(null)
    onEnrolled()
  }

  if (step === "password" || enrolment === null) {
    return (
      <form onSubmit={(e) => void handleEnable(e)} className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="totp-enable-password">
            {t("nastaveni.currentPassword")}
          </Label>
          <Input
            id="totp-enable-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          <p className="text-xs text-muted-foreground">
            {t("nastaveni.totpEnableHint")}
          </p>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{t(error)}</AlertDescription>
          </Alert>
        ) : null}

        <Button type="submit" disabled={pending} className="justify-self-start">
          {pending ? t("nastaveni.pending") : t(submitLabelKey)}
        </Button>
      </form>
    )
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <TotpQrCode value={enrolment.totpURI} />
        <p className="text-sm text-foreground">{t("nastaveni.totpScanHint")}</p>
        <a
          href={enrolment.totpURI}
          className="text-sm font-medium text-primary underline underline-offset-4"
        >
          {t("nastaveni.totpOpenInApp")}
        </a>
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">
            {t("nastaveni.totpManualSecret")}
          </span>
          <code className="rounded-md bg-secondary px-2 py-1 font-mono text-sm break-all">
            {secretOf(enrolment.totpURI) ?? enrolment.totpURI}
          </code>
        </div>
      </div>

      <BackupCodes codes={enrolment.backupCodes} />

      <form onSubmit={(e) => void handleVerify(e)} className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="totp-verify-code">{t("nastaveni.totpCode")}</Label>
          <Input
            id="totp-verify-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
            className="w-40"
          />
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{t(error)}</AlertDescription>
          </Alert>
        ) : null}

        <Button type="submit" disabled={pending} className="justify-self-start">
          {pending ? t("nastaveni.pending") : t("nastaveni.totpConfirm")}
        </Button>
      </form>
    </div>
  )
}

/**
 * The QR block, extracted as its own component (rather than inlined into the
 * "verify" step's JSX above) so `totp-enrolment.test.tsx` can render it
 * directly with a static `value`. `QRCodeSvg`'s actual SVG body only appears
 * after `QRCode`'s `useLayoutEffect` runs (see `packages/ui/.../qr-code.tsx`),
 * which `react-dom/server`'s `renderToStaticMarkup` — the convention every
 * other `apps/beta` component test uses — never fires; a test against this
 * component still asserts the wiring that matters: the URI reaching `QRCode`
 * and the same `size`/`level` the main app's MFA setup screen uses.
 */
export function TotpQrCode({ value }: { value: string }) {
  return (
    <div className="mx-auto rounded-xl border border-input bg-white p-4">
      <QRCode value={value} size={192} level="M">
        <QRCodeSvg />
      </QRCode>
    </div>
  )
}

/**
 * The `secret` parameter of an `otpauth://` URI, for the manual-entry path.
 *
 * Parsed rather than asked for separately: Better Auth returns the URI and not
 * the bare secret, and a second endpoint call to get the same bytes would be a
 * second place the secret travels.
 */
function secretOf(totpURI: string): string | null {
  try {
    return new URL(totpURI).searchParams.get("secret")
  } catch {
    return null
  }
}
