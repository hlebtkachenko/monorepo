"use client"

import * as React from "react"

import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Textarea } from "@workspace/ui/components/textarea"

import { useBetaTranslations } from "@/i18n/translations"
import type { PartnerView } from "@/lib/data/projections"
import {
  PARTNER_ARES_FIELD_LABEL,
  PARTNER_ROLE_LABEL_KEY,
  PARTNER_ROLE_OPTIONS,
} from "@/lib/partner-labels"

import {
  lookupPartnerAresAction,
  savePartnerAction,
} from "../../_actions/partners"
import {
  PARTNER_ACTION_IDLE,
  type PartnerActionState,
} from "../../_actions/partner-state"

/**
 * Zadávání dat › Partneři (spec §2.4, §3.3, §4's Partneři + ARES prefill).
 *
 * ONE FORM COMPONENT, TWO CALLERS. The create card above the table and each
 * existing row's `<details>` disclosure both render `PartnerForm` — a
 * partner has thirteen editable fields, wide enough that a second, narrower
 * "edit row" (the shape `liabilities-section.tsx` uses) would either drop
 * fields or grow unreadable inline. `<details>` keeps the table compact by
 * default and needs no client state to toggle: it is a real HTML disclosure,
 * so the row still works with JavaScript off.
 *
 * TWO SUBMIT INTENTS, ONE `useActionState`, exactly `AresPanel`'s own
 * pattern: `intent=lookup` renders "ARES navrhuje" and touches at most the
 * `ares_fetched_at` stamp (only when editing — a draft create has no row to
 * stamp yet); `intent=save` is the actual create/update, and re-derives
 * whatever the office ticked rather than trusting a posted value.
 */
async function dispatch(
  previous: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  return formData.get("intent") === "lookup"
    ? lookupPartnerAresAction(previous, formData)
    : savePartnerAction(previous, formData)
}

function PartnerForm({
  orgSlug,
  partner,
}: {
  orgSlug: string
  partner?: PartnerView & { readonly noteInternal?: string }
}) {
  const t = useBetaTranslations()
  const [state, formAction, pending] = React.useActionState(
    dispatch,
    PARTNER_ACTION_IDLE,
  )
  const idPrefix = partner?.id ?? "new"
  const suggestions = state.status === "suggestions" ? state.suggestions : []

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-3">
      <input type="hidden" name="orgSlug" value={orgSlug} />
      {partner ? (
        <input type="hidden" name="partnerId" value={partner.id} />
      ) : null}
      <input
        type="hidden"
        name="currentLegalFormCsuCode"
        value={partner?.legalFormCsuCode ?? ""}
      />
      <input
        type="hidden"
        name="currentRegistryFileNumber"
        value={partner?.registryFileNumber ?? ""}
      />

      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-name`}>
          {t("zadavani.fieldPartnerName")}
        </Label>
        <Input
          id={`${idPrefix}-name`}
          name="name"
          required
          defaultValue={partner?.name ?? ""}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-role`}>{t("zadavani.fieldRole")}</Label>
        <NativeSelect
          id={`${idPrefix}-role`}
          name="role"
          defaultValue={partner?.role ?? "other"}
        >
          {PARTNER_ROLE_OPTIONS.map((role) => (
            <NativeSelectOption key={role} value={role}>
              {t(PARTNER_ROLE_LABEL_KEY[role])}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-ico`}>{t("zadavani.fieldIco")}</Label>
        <div className="flex gap-2">
          <Input
            id={`${idPrefix}-ico`}
            name="ico"
            inputMode="numeric"
            autoComplete="off"
            defaultValue={partner?.ico ?? ""}
          />
          <Button
            type="submit"
            name="intent"
            value="lookup"
            variant="outline"
            size="sm"
            disabled={pending}
          >
            {t("zadavani.aresLookup")}
          </Button>
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-dic`}>{t("zadavani.fieldDic")}</Label>
        <Input
          id={`${idPrefix}-dic`}
          name="dic"
          defaultValue={partner?.dic ?? ""}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-email`}>{t("zadavani.fieldEmail")}</Label>
        <Input
          id={`${idPrefix}-email`}
          name="email"
          type="email"
          defaultValue={partner?.email ?? ""}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-phone`}>{t("zadavani.fieldPhone")}</Label>
        <Input
          id={`${idPrefix}-phone`}
          name="phone"
          defaultValue={partner?.phone ?? ""}
        />
      </div>
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-street`}>
          {t("zadavani.fieldStreet")}
        </Label>
        <Input
          id={`${idPrefix}-street`}
          name="street"
          defaultValue={partner?.street ?? ""}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-houseNumber`}>
          {t("zadavani.fieldHouseNumber")}
        </Label>
        <Input
          id={`${idPrefix}-houseNumber`}
          name="houseNumber"
          defaultValue={partner?.houseNumber ?? ""}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-orientationNumber`}>
          {t("zadavani.fieldOrientationNumber")}
        </Label>
        <Input
          id={`${idPrefix}-orientationNumber`}
          name="orientationNumber"
          defaultValue={partner?.orientationNumber ?? ""}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-city`}>{t("zadavani.fieldCity")}</Label>
        <Input
          id={`${idPrefix}-city`}
          name="city"
          defaultValue={partner?.city ?? ""}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-postalCode`}>
          {t("zadavani.fieldPostalCode")}
        </Label>
        <Input
          id={`${idPrefix}-postalCode`}
          name="postalCode"
          defaultValue={partner?.postalCode ?? ""}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-countryCode`}>
          {t("zadavani.fieldCountryCode")}
        </Label>
        <Input
          id={`${idPrefix}-countryCode`}
          name="countryCode"
          className="w-20"
          defaultValue={partner?.countryCode ?? "CZ"}
        />
      </div>

      <div className="grid gap-2 sm:col-span-3">
        <Label htmlFor={`${idPrefix}-noteClient`}>
          {t("zadavani.fieldNoteClient")}
        </Label>
        <Textarea
          id={`${idPrefix}-noteClient`}
          name="noteClient"
          rows={2}
          defaultValue={partner?.noteClient ?? ""}
        />
      </div>
      <div className="grid gap-2 sm:col-span-3">
        <Label htmlFor={`${idPrefix}-noteInternal`}>
          {t("zadavani.fieldNoteInternal")}
        </Label>
        <Textarea
          id={`${idPrefix}-noteInternal`}
          name="noteInternal"
          rows={2}
          defaultValue={partner?.noteInternal ?? ""}
        />
      </div>

      {suggestions.length > 0 ? (
        <ul className="col-span-full grid gap-2">
          {suggestions.map((suggestion) => (
            <li
              key={suggestion.field}
              className="flex items-start gap-3 rounded-md bg-secondary/40 p-3"
            >
              <Checkbox
                id={`${idPrefix}-accept-${suggestion.field}`}
                name="accept"
                value={suggestion.field}
                className="mt-0.5"
              />
              <Label
                htmlFor={`${idPrefix}-accept-${suggestion.field}`}
                className="grid gap-0.5 font-normal"
              >
                <span className="text-sm font-medium text-foreground">
                  {t(PARTNER_ARES_FIELD_LABEL[suggestion.field])}
                </span>
                <span className="text-xs text-muted-foreground">
                  {suggestion.current === null
                    ? t("zadavani.aresEmptyCurrent")
                    : suggestion.current}
                  {" → "}
                  <span className="text-foreground">
                    {suggestion.suggested}
                  </span>
                </span>
              </Label>
            </li>
          ))}
        </ul>
      ) : null}

      {state.status === "suggestions" && suggestions.length === 0 ? (
        <Alert className="col-span-full">
          <AlertDescription>{t("zadavani.aresNoDiff")}</AlertDescription>
        </Alert>
      ) : null}

      {state.status === "error" ? (
        <Alert variant="destructive" className="col-span-full">
          <AlertDescription>{t(state.error)}</AlertDescription>
        </Alert>
      ) : null}

      {state.status === "ok" ? (
        <Alert className="col-span-full">
          <AlertDescription>{t(state.message)}</AlertDescription>
        </Alert>
      ) : null}

      <div className="col-span-full">
        <Button type="submit" name="intent" value="save" disabled={pending}>
          {pending
            ? t("zadavani.pending")
            : partner
              ? t("zadavani.save")
              : t("zadavani.create")}
        </Button>
      </div>
    </form>
  )
}

export function PartnersSection({
  partners,
  orgSlug,
}: {
  partners: readonly (PartnerView & { readonly noteInternal?: string })[]
  orgSlug: string
}) {
  const t = useBetaTranslations()

  return (
    <section className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base">
            {t("zadavani.partnerCreateTitle")}
          </CardTitle>
          <CardDescription>{t("zadavani.partnersHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <PartnerForm orgSlug={orgSlug} />
        </CardContent>
      </Card>

      <h2 className="font-heading text-base font-semibold">
        {t("zadavani.partnersTitle")}
      </h2>

      {partners.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("zadavani.noRows")}</p>
      ) : (
        <ul className="grid gap-2">
          {partners.map((p) => (
            <li
              key={p.id}
              className="rounded-lg border border-border-subtle p-3"
            >
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.ico ?? "—"}
                  </span>
                  <Badge variant="outline">
                    {t(PARTNER_ROLE_LABEL_KEY[p.role])}
                  </Badge>
                  {p.source === "saldokonto" ? (
                    <Badge variant="secondary">
                      {t("zadavani.partnerSourceSaldokonto")}
                    </Badge>
                  ) : null}
                </summary>
                <div className="mt-3">
                  <PartnerForm orgSlug={orgSlug} partner={p} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
