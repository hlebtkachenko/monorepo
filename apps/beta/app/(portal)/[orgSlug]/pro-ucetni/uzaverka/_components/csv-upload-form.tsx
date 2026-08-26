"use client"

import * as React from "react"

import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"

import { useBetaTranslations } from "@/i18n/translations"
import { IMPORT_DATASET_LABEL_KEY } from "@/lib/import-labels"
import { CSV_DATASETS } from "@/lib/import/datasets"

import {
  UZAVERKA_ACTION_IDLE,
  type UzaverkaActionState,
} from "../../_actions/uzaverka-state"

/**
 * The manual fallback's one form (spec §3.2): pick a dataset, state the period,
 * drop a CSV.
 *
 * IT CREATES A DRAFT, NEVER A PUBLICATION, and the submit button says so
 * ("Nahrát jako rozpracovaný import"). The office then lands on the batch's own
 * preview and publishes from there. Two clicks for the one operation in this
 * product that changes what a client's statement IS.
 *
 * THE REFUSAL IS THE INTERESTING STATE, which is why most of this component is
 * about rendering one. A rejected file lists its lines — "řádek 14, sloupec
 * Konečný zůstatek" — because the alternative is an office re-exporting blind
 * at month end. Nothing is imported partially: the list is the whole reason the
 * file was refused, and fixing it is one edit, not one per attempt.
 *
 * `useActionState` for the same two reasons `OfficeActionForm` gives — the
 * pending state is the framework's, and the controls are real form controls
 * posting to a real endpoint.
 */
export function CsvUploadForm({
  action,
  orgSlug,
  defaultYear,
  defaultMonth,
}: Readonly<{
  action: (
    previous: UzaverkaActionState,
    formData: FormData,
  ) => Promise<UzaverkaActionState>
  orgSlug: string
  /** Prefilled from the period under review, so the common case is one click. */
  defaultYear: number
  defaultMonth: number
}>) {
  const t = useBetaTranslations()
  const [state, formAction, pending] = React.useActionState(
    action,
    UZAVERKA_ACTION_IDLE,
  )

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="orgSlug" value={orgSlug} />
      {/*
        A month period. The import spine accepts quarters and years too, but a
        uzávěrka is monthly (§0.6 costs it per month) and a period-kind selector
        would be three more controls for a case the fallback does not have.
        Quarterly and annual batches arrive through the agent API.
      */}
      <input type="hidden" name="periodKind" value="month" />

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="dataset">{t("uzaverka.fieldDataset")}</Label>
          <NativeSelect id="dataset" name="dataset" required defaultValue="">
            <NativeSelectOption value="" disabled>
              —
            </NativeSelectOption>
            {CSV_DATASETS.map((dataset) => (
              <NativeSelectOption key={dataset} value={dataset}>
                {t(IMPORT_DATASET_LABEL_KEY[dataset])}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="month">{t("uzaverka.fieldMonth")}</Label>
          <Input
            id="month"
            name="month"
            inputMode="numeric"
            defaultValue={String(defaultMonth)}
            required
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="year">{t("uzaverka.fieldYear")}</Label>
          <Input
            id="year"
            name="year"
            inputMode="numeric"
            defaultValue={String(defaultYear)}
            required
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="file">{t("uzaverka.fieldFile")}</Label>
        <Input
          id="file"
          name="file"
          type="file"
          accept=".csv,text/csv"
          required
        />
        <p className="text-xs text-muted-foreground">
          {t("uzaverka.fileHint")}
        </p>
      </div>

      <Button
        type="submit"
        size="sm"
        disabled={pending}
        className="justify-self-start"
      >
        {pending ? t("uzaverka.pending") : t("uzaverka.uploadSubmit")}
      </Button>

      {state.status === "error" ? (
        <Alert variant="destructive">
          <AlertDescription>{t(state.error)}</AlertDescription>
        </Alert>
      ) : null}

      {state.status === "ok" ? (
        <Alert>
          <AlertDescription>{t(state.message)}</AlertDescription>
        </Alert>
      ) : null}

      {state.status === "csv_rejected" ? (
        <Alert variant="destructive">
          <AlertDescription>
            <p className="font-medium">{t(state.error)}</p>

            {state.missingColumns.length > 0 ? (
              <p className="mt-1">
                {t("uzaverka.csvMissingColumnsPrefix")}{" "}
                {state.missingColumns.join(", ")}
              </p>
            ) : null}

            {state.issues.length > 0 ? (
              <ul className="mt-2 grid gap-0.5 text-sm">
                {state.issues.map((issue) => (
                  <li
                    key={`${issue.line}-${issue.column ?? ""}-${issue.message}`}
                  >
                    {t("uzaverka.csvIssueLinePrefix")} {issue.line}
                    {issue.column === null ? "" : `, ${issue.column}`}:{" "}
                    {t(issue.message)}
                  </li>
                ))}
              </ul>
            ) : null}

            {state.hiddenIssues > 0 ? (
              <p className="mt-1">
                {t("uzaverka.csvMoreIssuesPrefix")} {state.hiddenIssues}
              </p>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
    </form>
  )
}
