"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Controller, useForm, type Control } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { useTranslations } from "@workspace/i18n/client"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Heading } from "@workspace/ui/components/heading"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Text } from "@workspace/ui/components/text"

import { createOrgAction, prefillOrgAction } from "./actions"
import {
  LEGAL_FORM_OPTIONS,
  OrgWizardSchema,
  REGIME_OPTIONS,
  SIZE_OPTIONS,
  VAT_REGIME_OPTIONS,
  WIZARD_DEFAULTS,
  type OrgWizardInput,
} from "../_lib/wizard-schema"

type Step = "lookup" | "details"

const KNOWN_ERROR_KEYS = new Set([
  "invalidIco",
  "sessionExpired",
  "noActiveWorkspace",
  "invalidInput",
  "createFailed",
  "REGIME_AMBIGUOUS",
  "REGIME_NOT_ALLOWED",
  "REGIME_CONFLICT",
  "SINGLE_ENTRY_VAT_PAYER",
  "NONPROFIT_DOUBLE_ENTRY_UNSUPPORTED",
  "MISSING_PERIOD_START",
  "VAT_PAYER_REQUIRES_DIC",
  "INVALID_FISCAL_YEAR_START",
  "OSS_REQUIRES_VAT_REGISTRATION",
])

export function CreateOrgWizard() {
  const router = useRouter()
  const t = useTranslations("createOrg")
  const tErr = useTranslations("createOrg.errors")
  const [step, setStep] = useState<Step>("lookup")
  const [ico, setIco] = useState("")
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [idempotencyKey] = useState(() => crypto.randomUUID())

  const form = useForm<OrgWizardInput>({
    resolver: zodResolver(OrgWizardSchema),
    defaultValues: WIZARD_DEFAULTS,
    mode: "onSubmit",
  })

  // ScaffoldValidationError codes + action error keys share this namespace.
  function tErrKey(key: string | undefined): string {
    const resolved = key && KNOWN_ERROR_KEYS.has(key) ? key : "createFailed"
    return tErr(resolved as Parameters<typeof tErr>[0])
  }

  async function onLookup() {
    setServerError(null)
    setNotice(null)
    setBusy(true)
    try {
      const res = await prefillOrgAction(ico)
      if (!res.ok) {
        setServerError(tErrKey(res.errorKey))
        return
      }
      const s = res.suggestion ?? {}
      // Merge suggested values into the form; keep untouched fields.
      for (const [key, value] of Object.entries(s)) {
        if (value !== undefined && value !== null) {
          form.setValue(key as keyof OrgWizardInput, value as never)
        }
      }
      if (res.warnings && res.warnings.length > 0) {
        setNotice(res.warnings.join(" "))
      }
      setStep("details")
    } finally {
      setBusy(false)
    }
  }

  async function onSubmit(values: OrgWizardInput) {
    setServerError(null)
    setBusy(true)
    try {
      const res = await createOrgAction(values, idempotencyKey)
      if (!res.ok || !res.slug) {
        setServerError(tErrKey(res.errorKey))
        return
      }
      router.push(`/${res.slug}`)
    } finally {
      setBusy(false)
    }
  }

  const vatRegime = form.watch("vatRegimeCode")
  const entityKind = form.watch("entityKind")

  if (step === "lookup") {
    return (
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <Heading level={2} className="mt-0">
            {t("title")}
          </Heading>
          <Text variant="muted">{t("lookupDescription")}</Text>
        </header>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="ico">{t("ico")}</FieldLabel>
            <Input
              id="ico"
              inputSize="xl"
              inputMode="numeric"
              placeholder="12345678"
              value={ico}
              onChange={(e) => setIco(e.target.value.replace(/\D/g, ""))}
              maxLength={8}
              autoFocus
            />
          </Field>
          {serverError ? <FieldError>{serverError}</FieldError> : null}
        </FieldGroup>
        <div className="flex gap-3">
          <Button
            type="button"
            onClick={() => void onLookup()}
            disabled={busy || ico.length !== 8}
          >
            {busy ? t("lookingUp") : t("lookup")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setStep("details")}
          >
            {t("enterManually")}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Heading level={2} className="mt-0">
          {t("detailsTitle")}
        </Heading>
        <Text variant="muted">{t("detailsDescription")}</Text>
      </header>
      {notice ? <Text variant="muted">{notice}</Text> : null}

      <form
        onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
        className="flex flex-col gap-5"
        noValidate
      >
        <FieldGroup>
          <Field
            data-invalid={form.formState.errors.legalName ? "true" : undefined}
          >
            <FieldLabel htmlFor="legalName">{t("legalName")}</FieldLabel>
            <Input
              id="legalName"
              inputSize="xl"
              {...form.register("legalName")}
            />
          </Field>

          <EnumField
            name="legalFormCode"
            label={t("legalForm")}
            control={form.control}
            options={LEGAL_FORM_OPTIONS.map((o) => ({
              value: o.code,
              label: o.label,
            }))}
          />

          <EnumField
            name="personKind"
            label={t("personKind")}
            control={form.control}
            options={[
              { value: "legal_entity", label: t("personKindLegal") },
              { value: "natural_person", label: t("personKindNatural") },
            ]}
          />

          <EnumField
            name="regimeCode"
            label={t("regime")}
            control={form.control}
            placeholder={t("regimeAuto")}
            options={REGIME_OPTIONS.map((r) => ({
              value: r,
              label: t(`regimeOptions.${r}` as Parameters<typeof t>[0]),
            }))}
          />

          <EnumField
            name="accountingSizeCode"
            label={t("size")}
            control={form.control}
            placeholder="—"
            options={SIZE_OPTIONS.map((s) => ({ value: s, label: s }))}
          />

          <EnumField
            name="vatRegimeCode"
            label={t("vatRegime")}
            control={form.control}
            options={VAT_REGIME_OPTIONS.map((v) => ({
              value: v,
              label: t(`vatOptions.${v}` as Parameters<typeof t>[0]),
            }))}
          />

          {vatRegime === "PAYER" ? (
            <EnumField
              name="vatFilingPeriod"
              label={t("vatFilingPeriod")}
              control={form.control}
              placeholder="MONTHLY"
              options={[
                { value: "MONTHLY", label: t("filingMonthly") },
                { value: "QUARTERLY", label: t("filingQuarterly") },
              ]}
            />
          ) : null}

          <EnumField
            name="entityKind"
            label={t("entityKind")}
            control={form.control}
            options={[
              { value: "NEW_ENTITY", label: t("entityNew") },
              { value: "MIGRATED_ENTITY", label: t("entityMigrated") },
            ]}
          />

          <Field>
            <FieldLabel htmlFor="periodDate">
              {entityKind === "MIGRATED_ENTITY"
                ? t("conversionDate")
                : t("registeredAt")}
            </FieldLabel>
            <Input
              id="periodDate"
              type="date"
              {...form.register(
                entityKind === "MIGRATED_ENTITY"
                  ? "periodStart"
                  : "registeredAt",
              )}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="fiscalYear">{t("fiscalYear")}</FieldLabel>
            <Input
              id="fiscalYear"
              type="number"
              placeholder="2026"
              {...form.register("fiscalYear")}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="dic">{t("dic")}</FieldLabel>
            <Input
              id="dic"
              placeholder="CZ12345678"
              {...form.register("dic")}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="street">{t("address")}</FieldLabel>
            <Input
              id="street"
              placeholder={t("street")}
              {...form.register("street")}
            />
            <div className="flex gap-3">
              <Input placeholder={t("city")} {...form.register("city")} />
              <Input
                placeholder={t("postalCode")}
                {...form.register("postalCode")}
              />
              <Input placeholder={t("region")} {...form.register("region")} />
            </div>
          </Field>

          <Text variant="muted" className="mt-2">
            {t("moreDetails")}
          </Text>

          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="dataBoxId">{t("dataBox")}</FieldLabel>
              <Input
                id="dataBoxId"
                placeholder="abc1234"
                maxLength={7}
                {...form.register("dataBoxId")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="taxOfficeCode">{t("taxOffice")}</FieldLabel>
              <Input id="taxOfficeCode" {...form.register("taxOfficeCode")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="contactEmail">{t("email")}</FieldLabel>
              <Input
                id="contactEmail"
                type="email"
                {...form.register("contactEmail")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="contactPhone">{t("phone")}</FieldLabel>
              <Input id="contactPhone" {...form.register("contactPhone")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="website">{t("website")}</FieldLabel>
              <Input id="website" {...form.register("website")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="registryFileNumber">
                {t("registryFile")}
              </FieldLabel>
              <Input
                id="registryFileNumber"
                {...form.register("registryFileNumber")}
              />
            </Field>
          </div>

          <Text variant="muted" className="mt-2">
            {t("signer")}
          </Text>
          <div className="grid grid-cols-3 gap-3">
            <Input
              placeholder={t("signerGivenName")}
              {...form.register("signerGivenName")}
            />
            <Input
              placeholder={t("signerFamilyName")}
              {...form.register("signerFamilyName")}
            />
            <Input
              placeholder={t("signerPosition")}
              {...form.register("signerPosition")}
            />
          </div>

          {vatRegime !== "NON_PAYER" ? (
            <div className="flex items-end gap-3">
              <EnumField
                name="ossScheme"
                label={t("oss")}
                control={form.control}
                placeholder={t("ossNone")}
                options={[
                  { value: "UNION", label: t("ossUnion") },
                  { value: "IMPORT", label: t("ossImport") },
                ]}
              />
              <Field>
                <FieldLabel htmlFor="ossValidFrom">
                  {t("ossValidFrom")}
                </FieldLabel>
                <Input
                  id="ossValidFrom"
                  type="date"
                  {...form.register("ossValidFrom")}
                />
              </Field>
            </div>
          ) : null}
        </FieldGroup>

        {serverError ? <FieldError>{serverError}</FieldError> : null}

        <div className="flex gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? t("creating") : t("create")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setStep("lookup")}
          >
            {t("back")}
          </Button>
        </div>
      </form>
    </div>
  )
}

function EnumField({
  name,
  label,
  control,
  options,
  placeholder,
}: {
  name: keyof OrgWizardInput
  label: string
  control: Control<OrgWizardInput>
  options: Array<{ value: string; label: string }>
  placeholder?: string
}) {
  return (
    <Field>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Select
            value={typeof field.value === "string" ? field.value : undefined}
            onValueChange={field.onChange}
          >
            <SelectTrigger id={name}>
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </Field>
  )
}
