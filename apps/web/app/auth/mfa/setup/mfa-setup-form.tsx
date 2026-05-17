"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { authClient } from "@workspace/auth/client"
import { useTranslations } from "@workspace/i18n/client"
import { OTPSchema, type OTPInput } from "@workspace/shared/auth"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Heading } from "@workspace/ui/components/heading"
import {
  INPUT_OTP_PATTERNS,
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@workspace/ui/components/input-otp"
import { PasswordInput } from "@workspace/ui/components/password-input"
import { QRCode, QRCodeSvg } from "@workspace/ui/components/qr-code"
import { Text } from "@workspace/ui/components/text"
import { Copy, Check } from "@workspace/ui/lib/icons"

// Enrollment is a 4-stage wizard: confirm password, scan the QR, save the
// backup codes, then enter a TOTP code to finish. The backup-codes stage
// is mandatory — without recovery codes a lost authenticator locks the
// user out permanently.
type Stage = "password" | "qr" | "backup" | "totp"

interface EnrollState {
  totpURI: string
  secret: string
  backupCodes: string[]
}

interface TwoFactorEnableResult {
  totpURI?: string
  backupCodes?: string[]
}

const OTP_RE = /^\d{6}$/

export function MfaSetupForm() {
  const router = useRouter()
  const t = useTranslations("auth.mfa.setup")
  const tBrand = useTranslations("brand")
  const tValidation = useTranslations("auth.validation")

  const [stage, setStage] = useState<Stage>("password")
  const [password, setPassword] = useState("")
  const [enroll, setEnroll] = useState<EnrollState | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSubmitting, setPasswordSubmitting] = useState(false)
  const [copied, setCopied] = useState<"uri" | "secret" | "backup" | null>(null)
  const [backupAck, setBackupAck] = useState(false)
  const [backupError, setBackupError] = useState<string | null>(null)

  const otpForm = useForm<OTPInput>({
    resolver: zodResolver(OTPSchema),
    defaultValues: { code: "" },
    mode: "onSubmit",
  })
  const [otpServerError, setOtpServerError] = useState<string | null>(null)
  const code = otpForm.watch("code")

  async function onSubmitPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPasswordError(null)
    setPasswordSubmitting(true)
    try {
      const result = await authClient.twoFactor.enable({ password })
      if (result.error) {
        setPasswordError(result.error.message ?? t("password.errorGeneric"))
        return
      }
      const data = result.data as TwoFactorEnableResult | null
      const totpURI = data?.totpURI
      if (!totpURI) {
        setPasswordError(t("password.errorMissingUri"))
        return
      }
      const backupCodes = data?.backupCodes ?? []
      if (backupCodes.length === 0) {
        // Without backup codes the user can be permanently locked out
        // if they lose their authenticator. Refuse to advance.
        setPasswordError(t("password.errorMissingBackup"))
        return
      }
      setEnroll({ totpURI, secret: extractSecret(totpURI), backupCodes })
      setStage("qr")
    } catch (err) {
      setPasswordError((err as Error).message ?? t("password.errorGeneric"))
    } finally {
      setPasswordSubmitting(false)
    }
  }

  function onAcknowledgeBackup() {
    if (!backupAck) {
      setBackupError(t("backup.errorNotAcknowledged"))
      return
    }
    setBackupError(null)
    setStage("totp")
  }

  function translateOtpValidation(msg: string | undefined): string | undefined {
    if (!msg) return undefined
    if (msg.startsWith("otp.")) return tValidation(msg)
    return msg
  }

  async function onSubmitVerify(values: OTPInput) {
    setOtpServerError(null)
    try {
      const result = await authClient.twoFactor.verifyTotp({
        code: values.code,
      })
      if (result.error) {
        setOtpServerError(result.error.message ?? t("verify.errorGeneric"))
        return
      }
      // Scrub sensitive state from memory before navigating away. The
      // TOTP secret + backup codes only ever lived in this component;
      // clearing them shrinks the window where DevTools or a hot-reload
      // could expose them.
      setEnroll(null)
      otpForm.reset({ code: "" })
      setPassword("")
      router.push("/workspace/profile?mfa=enabled")
    } catch (err) {
      setOtpServerError((err as Error).message ?? t("verify.errorGeneric"))
    }
  }

  async function copyValue(value: string, which: "uri" | "secret" | "backup") {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(which)
      setTimeout(() => setCopied((c) => (c === which ? null : c)), 1500)
    } catch {
      // clipboard may be unavailable (insecure context); silently ignore
    }
  }

  if (stage === "password") {
    return (
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <Heading level={2} className="mt-0">
            {t("password.title")}
          </Heading>
          <Text variant="muted">{t("password.description")}</Text>
        </header>

        <form
          onSubmit={onSubmitPassword}
          className="flex flex-col gap-5"
          noValidate
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="mfa-password">
                {t("password.label")}
              </FieldLabel>
              <PasswordInput
                id="mfa-password"
                autoComplete="current-password"
                autoFocus
                inputSize="xl"
                value={password}
                onValueChange={setPassword}
                required
              />
            </Field>
          </FieldGroup>

          {passwordError && (
            <Text variant="small" className="text-destructive" role="alert">
              {passwordError}
            </Text>
          )}

          <Button
            type="submit"
            size="xl"
            disabled={passwordSubmitting || password.length === 0}
          >
            {passwordSubmitting
              ? t("password.submitting")
              : t("password.submit")}
          </Button>
        </form>
      </div>
    )
  }

  if (stage === "qr") {
    return (
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <Heading level={2} className="mt-0">
            {t("verify.step1")}
          </Heading>
          <Text variant="muted">{t("verify.step1Description")}</Text>
        </header>

        {enroll && (
          <section className="flex flex-col gap-4">
            <button
              type="button"
              onClick={() => copyValue(enroll.totpURI, "uri")}
              aria-label={t("verify.copy")}
              className="group relative mx-auto rounded-xl border border-input bg-white p-4 transition-colors hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <QRCode value={enroll.totpURI} size={192} level="M">
                <QRCodeSvg />
              </QRCode>
              <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-background/95 px-2 py-1 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                {copied === "uri" ? (
                  <Check className="size-3" aria-hidden="true" />
                ) : (
                  <Copy className="size-3" aria-hidden="true" />
                )}
                {copied === "uri" ? t("verify.copied") : t("verify.copy")}
              </span>
            </button>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">
                  {t("verify.secretLabel")}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copyValue(enroll.secret, "secret")}
                  aria-label={t("verify.copy")}
                >
                  {copied === "secret" ? (
                    <Check className="size-4" aria-hidden="true" />
                  ) : (
                    <Copy className="size-4" aria-hidden="true" />
                  )}
                  {copied === "secret" ? t("verify.copied") : t("verify.copy")}
                </Button>
              </div>
              <code className="block w-full rounded-lg border border-input bg-muted/40 p-3 text-xs break-all">
                {enroll.secret}
              </code>
              <Text variant="small" className="text-muted-foreground">
                {t("verify.secretHint")}
              </Text>
            </div>
          </section>
        )}

        <Button type="button" size="xl" onClick={() => setStage("backup")}>
          {t("verify.continue")}
        </Button>
      </div>
    )
  }

  if (stage === "backup") {
    return (
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <Heading level={2} className="mt-0">
            {t("backup.title")}
          </Heading>
          <Text variant="muted">{t("backup.description")}</Text>
        </header>

        {enroll && (
          <section className="flex flex-col gap-4">
            <ul className="grid grid-cols-2 gap-2 rounded-lg border border-input bg-muted/40 p-4 font-mono text-sm">
              {enroll.backupCodes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => copyValue(enroll.backupCodes.join("\n"), "backup")}
            >
              {copied === "backup" ? (
                <Check className="size-4" aria-hidden="true" />
              ) : (
                <Copy className="size-4" aria-hidden="true" />
              )}
              {copied === "backup" ? t("backup.copied") : t("backup.copy")}
            </Button>
            <label className="flex items-start gap-2.5 text-sm">
              <Checkbox
                checked={backupAck}
                onCheckedChange={(v) => setBackupAck(v === true)}
                className="mt-0.5"
              />
              <span className="text-muted-foreground">
                {t("backup.acknowledge")}
              </span>
            </label>
          </section>
        )}

        {backupError && (
          <Text variant="small" className="text-destructive" role="alert">
            {backupError}
          </Text>
        )}

        <Button
          type="button"
          size="xl"
          onClick={onAcknowledgeBackup}
          disabled={!backupAck}
        >
          {t("backup.submit")}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Heading level={2} className="mt-0">
          {t("verify.step2")}
        </Heading>
        <Text variant="muted">
          {t("verify.step2Description", { brand: tBrand("name") })}
        </Text>
      </header>

      <form
        onSubmit={otpForm.handleSubmit(onSubmitVerify)}
        className="flex flex-col gap-4"
        noValidate
      >
        <FieldGroup>
          <Field
            data-invalid={otpForm.formState.errors.code ? "true" : undefined}
          >
            <FieldLabel htmlFor="mfa-otp">{t("verify.label")}</FieldLabel>
            <InputOTP
              id="mfa-otp"
              maxLength={6}
              pattern={INPUT_OTP_PATTERNS.numeric}
              inputMode="numeric"
              value={code}
              onChange={(v) =>
                otpForm.setValue("code", v, { shouldValidate: false })
              }
              containerClassName="w-full"
              autoFocus
            >
              <InputOTPGroup size="xl">
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
            {otpForm.formState.errors.code && (
              <FieldError>
                {translateOtpValidation(otpForm.formState.errors.code.message)}
              </FieldError>
            )}
          </Field>
        </FieldGroup>

        {otpServerError && (
          <Text variant="small" className="text-destructive" role="alert">
            {otpServerError}
          </Text>
        )}

        <Button
          type="submit"
          size="xl"
          disabled={otpForm.formState.isSubmitting || !OTP_RE.test(code)}
        >
          {otpForm.formState.isSubmitting
            ? t("verify.submitting")
            : t("verify.submit")}
        </Button>

        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto self-start p-0 text-muted-foreground"
          onClick={() => {
            setStage("qr")
            otpForm.reset({ code: "" })
            setOtpServerError(null)
          }}
        >
          {t("verify.backToScan")}
        </Button>
      </form>
    </div>
  )
}

function extractSecret(totpURI: string): string {
  try {
    const url = new URL(totpURI)
    return url.searchParams.get("secret") ?? ""
  } catch {
    return ""
  }
}
