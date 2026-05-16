"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useFieldArray, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"

import { useTranslations } from "@workspace/i18n/client"
import { InviteListSchema, type InviteListInput } from "@workspace/shared/auth"
import { Button } from "@workspace/ui/components/button"
import { Heading } from "@workspace/ui/components/heading"
import {
  InviteRow,
  InviteRowAddButton,
} from "@workspace/ui/components/invite-row"
import { Text } from "@workspace/ui/components/text"
import { ArrowLeft } from "@workspace/ui/lib/icons"

import { AuthHeaderLinkOverride } from "../../auth/(default)/_components/auth-header-link"
import { submitTeamAction } from "../actions"

export function TeamForm() {
  const router = useRouter()
  const t = useTranslations("onboarding.team")
  const tCommon = useTranslations("common")
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

  const backIcon = useMemo(
    () => <ArrowLeft className="size-4" aria-hidden="true" />,
    [],
  )

  function announceResult(invitesSent: number, failures: number) {
    if (invitesSent > 0) {
      toast.success(t("toast.sentTitle", { count: invitesSent }), {
        description: t("toast.sentDescription"),
        duration: 8000,
      })
    }
    if (failures > 0) {
      toast.error(t("toast.failedTitle", { count: failures }), {
        description: t("toast.failedDescription"),
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
      <AuthHeaderLinkOverride
        href="/onboarding/plan"
        label={tCommon("back")}
        icon={backIcon}
      />
      <header className="flex flex-col gap-2">
        <Heading level={2} className="mt-0">
          {t("title")}
        </Heading>
        <Text variant="muted">{t("description")}</Text>
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

        <Text variant="muted" className="text-xs">
          {t("note")}
        </Text>

        {serverError && (
          <Text variant="small" className="text-destructive" role="alert">
            {serverError}
          </Text>
        )}

        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            type="submit"
            size="xl"
            className="sm:flex-1"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? t("submitting") : t("submit")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xl"
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
