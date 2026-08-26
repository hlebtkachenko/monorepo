"use client"

import { Alert, AlertDescription } from "@workspace/ui/components/alert"

import { useBetaTranslations } from "@/i18n/translations"

/**
 * The one-time display of a set of backup codes.
 *
 * SHOWN ONCE, AND ONLY ONCE. Better Auth stores them encrypted and returns the
 * plaintext exactly once — from `/two-factor/enable` and from
 * `/two-factor/generate-backup-codes` — with no endpoint that reads them back.
 * That is the property this component exists to make visible: there is no "show
 * my codes again" anywhere in this app, because there is nothing to show. The
 * warning above the list says so in the words the user needs before they close
 * the tab.
 *
 * Shared (`app/_components/`) because enrolment and regeneration both end here
 * and must present the same contract.
 *
 * A code is a credential: it is never logged, never posted anywhere, and lives
 * only in the caller's component state for the length of the interaction.
 */
export function BackupCodes({ codes }: { codes: readonly string[] }) {
  const t = useBetaTranslations()

  return (
    <div className="grid gap-2">
      <Alert>
        <AlertDescription>{t("nastaveni.backupCodesWarning")}</AlertDescription>
      </Alert>
      <ul className="grid grid-cols-2 gap-1 rounded-md bg-secondary p-3 font-mono text-sm sm:grid-cols-3">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
    </div>
  )
}
