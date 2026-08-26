"use client"

import * as React from "react"

import { Switch } from "@workspace/ui/components/switch"

import { useBetaTranslations } from "@/i18n/translations"

import { setEmailNotificationsEnabledAction } from "../_actions/notifications"

/**
 * The Nastavení › Účet email-notifications toggle (spec §2.10, §2.11).
 *
 * STANDALONE AND NOT YET MOUNTED ANYWHERE — Nastavení (PR 21/22) is a
 * different, in-flight territory this PR does not touch. The mount point,
 * once that route exists:
 *
 *   <EmailNotificationsToggle
 *     initialEnabled={await emailNotificationsEnabled(scope.userId)}
 *   />
 *
 * (`emailNotificationsEnabled`, `lib/data/notification-prefs.ts`). Shared
 * (`app/_components/`) for the same reason `SignOutButton` is: an
 * account-level control has no one route to belong to.
 *
 * OPTIMISTIC. Flips immediately on click and reverts if the Server Action
 * throws — the same trade `SignOutButton` makes for its own pending state,
 * scaled down since this write cannot meaningfully fail (no DB CHECK to
 * violate, just a boolean column).
 */
export function EmailNotificationsToggle({
  initialEnabled,
}: {
  initialEnabled: boolean
}) {
  const t = useBetaTranslations()
  const [enabled, setEnabled] = React.useState(initialEnabled)
  const [pending, setPending] = React.useState(false)

  async function handleChange(next: boolean) {
    setEnabled(next)
    setPending(true)
    try {
      await setEmailNotificationsEnabledAction(next)
    } catch {
      setEnabled(!next)
    } finally {
      setPending(false)
    }
  }

  return (
    <label className="flex items-center justify-between gap-4">
      <span className="flex flex-col">
        <span className="text-sm font-medium">
          {t("notifications.toggleLabel")}
        </span>
        <span className="text-sm text-muted-foreground">
          {t("notifications.toggleHint")}
        </span>
      </span>
      <Switch
        checked={enabled}
        disabled={pending}
        onCheckedChange={(next) => void handleChange(next)}
      />
    </label>
  )
}
