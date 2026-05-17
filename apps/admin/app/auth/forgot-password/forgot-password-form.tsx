"use client"

import { useState } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import {
  ForgotPasswordSchema,
  type ForgotPasswordInput,
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
import { requestPasswordResetAction } from "./actions"

/** Request a password-reset email for the admin surface. */
export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false)

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(ForgotPasswordSchema),
    defaultValues: { email: "" },
    mode: "onSubmit",
  })

  async function onSubmit(values: ForgotPasswordInput) {
    await requestPasswordResetAction(values.email)
    setSent(true)
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <Heading level={2} className="mt-0">
          Check your email
        </Heading>
        <Text variant="muted">
          If an account exists for that address, a password-reset link is on its
          way.
        </Text>
        <Text variant="small">
          <Link href="/auth/login" className="underline">
            Back to sign in
          </Link>
        </Text>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Heading level={2} className="mt-0">
          Reset your password
        </Heading>
        <Text variant="muted">
          Enter your email and we will send a reset link.
        </Text>
      </header>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-5"
        noValidate
      >
        <FieldGroup>
          <Field
            data-invalid={form.formState.errors.email ? "true" : undefined}
          >
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              {...form.register("email")}
              aria-invalid={!!form.formState.errors.email}
            />
            {form.formState.errors.email && (
              <FieldError>
                {authMessage(form.formState.errors.email.message)}
              </FieldError>
            )}
          </Field>
        </FieldGroup>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Sending…" : "Send reset link"}
        </Button>
      </form>
      <Text variant="small" className="text-muted-foreground">
        <Link href="/auth/login" className="underline">
          Back to sign in
        </Link>
      </Text>
    </div>
  )
}
