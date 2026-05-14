"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useFieldArray, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"

import { useTranslations } from "@workspace/i18n/client"
import { InviteListSchema, type InviteListInput } from "@workspace/shared/auth"
import { Button } from "@workspace/ui/components/button"
import {
  InviteRow,
  InviteRowAddButton,
} from "@workspace/ui/components/invite-row"

import { submitTeamAction } from "../../actions"

export function TeamForm() {
  const router = useRouter()
  const t = useTranslations("onboarding.team")
  const tErrors = useTranslations("onboarding.errors")

  const form = useForm<InviteListInput>({
    resolver: zodResolver(InviteListSchema),
    defaultValues: {
      invites: [
        { email: "", role: "member" },
        { email: "", role: "member" },
      ],
    },
    mode: "onSubmit",
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "invites",
  })

  const [serverError, setServerError] = useState<string | null>(null)

  function announceResult(invitesSent: number, failures: number) {
    if (invitesSent > 0) {
      toast.success(
        `${invitesSent} invite${invitesSent === 1 ? "" : "s"} sent`,
        {
          description:
            "If you don't see the email, the dev console transport prints links to your `pnpm dev` terminal — or visit /api/dev/outbox.",
          duration: 8000,
        },
      )
    }
    if (failures > 0) {
      toast.error(`${failures} invite${failures === 1 ? "" : "s"} failed`, {
        description: "Check the dev-server log for the underlying error.",
        duration: 8000,
      })
    }
  }

  async function onSubmit(values: InviteListInput) {
    setServerError(null)
    const result = await submitTeamAction(values)
    if (!result.ok) {
      setServerError(tErrors(result.errorKey ?? "saveTeamFailed"))
      return
    }
    announceResult(result.invitesSent ?? 0, result.failures?.length ?? 0)
    router.push("/onboarding/done")
  }

  async function onSkip() {
    setServerError(null)
    const result = await submitTeamAction({ invites: [] })
    if (!result.ok) {
      setServerError(tErrors(result.errorKey ?? "saveTeamFailed"))
      return
    }
    router.push("/onboarding/done")
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>

      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-5"
        noValidate
      >
        <div className="flex flex-col gap-3">
          {fields.map((field, index) => (
            <InviteRow
              key={field.id}
              email={form.watch(`invites.${index}.email`) ?? ""}
              role={form.watch(`invites.${index}.role`) ?? "member"}
              onEmailChange={(v) =>
                form.setValue(`invites.${index}.email`, v, {
                  shouldValidate: false,
                })
              }
              onRoleChange={(v) =>
                form.setValue(`invites.${index}.role`, v, {
                  shouldValidate: false,
                })
              }
              onRemove={() => remove(index)}
              removable={fields.length > 1}
            />
          ))}
          <InviteRowAddButton
            onClick={() => append({ email: "", role: "member" })}
            label={t("addAnother")}
          />
        </div>

        <p className="text-xs text-muted-foreground">{t("note")}</p>

        {serverError && (
          <p className="text-sm text-destructive" role="alert">
            {serverError}
          </p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            type="submit"
            size="lg"
            className="sm:flex-1"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? t("submitting") : t("submit")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={onSkip}
            disabled={form.formState.isSubmitting}
          >
            {t("skip")}
          </Button>
        </div>
      </form>
    </div>
  )
}
