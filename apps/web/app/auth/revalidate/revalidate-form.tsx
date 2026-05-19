"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "@workspace/i18n/client"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Heading } from "@workspace/ui/components/heading"
import { PasswordInput } from "@workspace/ui/components/password-input"
import { Text } from "@workspace/ui/components/text"

import { revalidateSessionAction } from "./revalidate-action"

function sanitizeNext(raw: string | null): string {
  if (!raw) return "/workspace"
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return "/workspace"
  }
  if (/^\/[A-Za-z][A-Za-z0-9+.-]*:/.test(raw)) {
    return "/workspace"
  }
  return raw
}

export function RevalidateForm() {
  const router = useRouter()
  const search = useSearchParams()
  const next = sanitizeNext(search.get("next"))

  const t = useTranslations("auth.revalidate")

  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const result = await revalidateSessionAction(password)
      if (!result.ok) {
        setError(
          result.error === "invalidCredentials"
            ? t("invalidCredentials")
            : t("error"),
        )
        return
      }
      router.push(next)
    } catch {
      setError(t("error"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Heading level={2} className="mt-0">
          {t("title")}
        </Heading>
        <Text variant="muted">{t("description")}</Text>
      </header>

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="flex flex-col gap-5"
        noValidate
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="revalidate-password">
              {t("passwordLabel")}
            </FieldLabel>
            <PasswordInput
              id="revalidate-password"
              autoComplete="current-password"
              autoFocus
              inputSize="xl"
              value={password}
              onValueChange={setPassword}
              required
            />
          </Field>
        </FieldGroup>

        {error && (
          <Text variant="small" className="text-destructive" role="alert">
            {error}
          </Text>
        )}

        <Button
          type="submit"
          size="xl"
          disabled={submitting || password.length === 0}
        >
          {submitting ? t("submitting") : t("submit")}
        </Button>
      </form>
    </div>
  )
}
