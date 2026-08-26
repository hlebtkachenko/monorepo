"use client"

import * as React from "react"

import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

import { useBetaTranslations } from "@/i18n/translations"
import type { IdentityField } from "@/lib/ares/suggestions"
import type { OrganizationIdentityView } from "@/lib/data/projections"

import { updateCompanyAction } from "../_actions/company"
import { NASTAVENI_ACTION_IDLE } from "../_actions/state"

import { IDENTITY_FIELD_LABEL } from "./labels"

/**
 * The owner's edit form for the identity card (spec §2.10).
 *
 * `useActionState`, not a hand-rolled `onSubmit`: the pending state is the
 * framework's and the form still submits without JavaScript — every control is
 * a real form control and the action is a real POST target.
 *
 * The field list is driven off `IDENTITY_FIELD_LABEL`, which is itself pinned to
 * `IDENTITY_FIELDS` by a `satisfies` clause, so this form cannot drift from what
 * the server is willing to write: a field added to the writable set that nobody
 * renders is a compile error in `labels.ts`, and a field rendered here that the
 * server does not accept cannot be named at all.
 *
 * VAT REGIME IS NOT HERE. Spec §3.5 gives it to /admin — it decides which Daně a
 * podání families exist — so the card DISPLAYS it (in the read-only summary
 * above this form) and this form has no input for it. There is no code path from
 * this page, or from an ARES answer, to `vat_regime`.
 */

/** Grouped for the eye only; the POST is flat and the server reads it flat. */
const GROUPS: readonly {
  readonly titleKey:
    | "nastaveni.groupIdentity"
    | "nastaveni.groupAddress"
    | "nastaveni.groupRegistry"
    | "nastaveni.groupBank"
    | "nastaveni.groupContact"
  readonly fields: readonly IdentityField[]
}[] = [
  {
    titleKey: "nastaveni.groupIdentity",
    fields: ["legalName", "ico", "dic"],
  },
  {
    titleKey: "nastaveni.groupAddress",
    fields: [
      "registeredStreet",
      "registeredHouseNumber",
      "registeredOrientationNumber",
      "registeredCity",
      "registeredPostalCode",
      "registeredCountryCode",
    ],
  },
  {
    titleKey: "nastaveni.groupRegistry",
    fields: ["courtFileNumber", "taxOfficeCode", "dataBoxId"],
  },
  {
    titleKey: "nastaveni.groupBank",
    fields: [
      "bankAccountPrefix",
      "bankAccountNumber",
      "bankCode",
      "iban",
      "bic",
    ],
  },
  {
    titleKey: "nastaveni.groupContact",
    fields: ["contactEmail", "contactPhone"],
  },
]

const VALUE_OF: Record<IdentityField, keyof OrganizationIdentityView> = {
  legalName: "legalName",
  ico: "ico",
  dic: "dic",
  registeredStreet: "registeredStreet",
  registeredHouseNumber: "registeredHouseNumber",
  registeredOrientationNumber: "registeredOrientationNumber",
  registeredCity: "registeredCity",
  registeredPostalCode: "registeredPostalCode",
  registeredCountryCode: "registeredCountryCode",
  dataBoxId: "dataBoxId",
  courtFileNumber: "courtFileNumber",
  taxOfficeCode: "taxOfficeCode",
  bankAccountPrefix: "bankAccountPrefix",
  bankAccountNumber: "bankAccountNumber",
  bankCode: "bankCode",
  iban: "iban",
  bic: "bic",
  contactEmail: "contactEmail",
  contactPhone: "contactPhone",
}

export function CompanyForm({
  orgSlug,
  identity,
}: {
  orgSlug: string
  identity: OrganizationIdentityView
}) {
  const t = useBetaTranslations()
  const [state, formAction, pending] = React.useActionState(
    updateCompanyAction,
    NASTAVENI_ACTION_IDLE,
  )

  return (
    <form action={formAction} className="grid gap-6">
      <input type="hidden" name="orgSlug" value={orgSlug} />

      {GROUPS.map((group) => (
        <fieldset key={group.titleKey} className="grid gap-3">
          <legend className="text-sm font-medium text-foreground">
            {t(group.titleKey)}
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {group.fields.map((field) => {
              const value = identity[VALUE_OF[field]]
              return (
                <div key={field} className="grid gap-1.5">
                  <Label htmlFor={`company-${field}`}>
                    {t(IDENTITY_FIELD_LABEL[field])}
                  </Label>
                  <Input
                    id={`company-${field}`}
                    name={field}
                    defaultValue={typeof value === "string" ? value : ""}
                    autoComplete="off"
                    {...(field === "contactEmail" ? { type: "email" } : {})}
                  />
                </div>
              )
            })}
          </div>
        </fieldset>
      ))}

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

      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? t("nastaveni.pending") : t("nastaveni.saveCompany")}
      </Button>
    </form>
  )
}
