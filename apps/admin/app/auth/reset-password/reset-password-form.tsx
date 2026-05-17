"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import {
  ResetPasswordSchema,
  type ResetPasswordInput,
} from "@workspace/shared/auth"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Heading } from "@workspace/ui/components/heading"
import { Input } from "@workspace/ui/components/input"
import { Text } from "@workspace/ui/components/text"

import { authMessage } from "../messages"
import { resetPasswordAction } from "./actions"

interface Props {
  token: string
}

/** Consume a reset-link token and set a new admin password. */
export function ResetPasswordForm({ token }: Props) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(ResetPasswordSchema),
    defaultValues: { token, password: "", confirm: "" },
    mode: "onSubmit",
  })

  async function onSubmit(values: ResetPasswordInput) {
    setServerError(null)
    const res = await resetPasswordAction(values.token, values.password)
    if (!res.ok) {
      setServerError(res.error ?? "Could not reset the password")
      return
    }
    router.push("/auth/login")
  }

  if (!token) {
    return (
      <div className="flex flex-col gap-4">
        <Heading level={2} className="mt-0">
          Invalid reset link
        </Heading>
        <Text variant="muted">
          This password-reset link is missing its token. Request a new one.
        </Text>
        <Text variant="small">
          <Link href="/auth/forgot-password" className="underline">
            Request a reset link
          </Link>
        </Text>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Heading level={2} className="mt-0">
          Set a new password
        </Heading>
        <Text variant="muted">
          Choose a password of at least 12 characters.
        </Text>
      </header>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-5"
        noValidate
      >
        <FieldGroup>
          <Field
            data-invalid={form.formState.errors.password ? "true" : undefined}
          >
            <FieldLabel htmlFor="password">New password</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              autoFocus
              {...form.register("password")}
              aria-invalid={!!form.formState.errors.password}
            />
            {form.formState.errors.password && (
              <FieldError>
                {authMessage(form.formState.errors.password.message)}
              </FieldError>
            )}
          </Field>
          <Field
            data-invalid={form.formState.errors.confirm ? "true" : undefined}
          >
            <FieldLabel htmlFor="confirm">Confirm password</FieldLabel>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              {...form.register("confirm")}
              aria-invalid={!!form.formState.errors.confirm}
            />
            {form.formState.errors.confirm && (
              <FieldError>
                {authMessage(form.formState.errors.confirm.message)}
              </FieldError>
            )}
          </Field>
        </FieldGroup>
        {serverError && (
          <Text variant="small" className="text-destructive" role="alert">
            {serverError}
          </Text>
        )}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Saving…" : "Set password"}
        </Button>
      </form>
    </div>
  )
}
