"use client"

import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { useBetaTranslations } from "@/i18n/translations"
import {
  ACCOUNT_KINDS,
  ACCOUNT_KIND_LABEL_KEY,
  ACCOUNT_MATCH_KINDS,
  ACCOUNT_MATCH_KIND_LABEL_KEY,
} from "@/lib/account-labels"
import type { AccountBalanceMappingView } from "@/lib/data/projections"

import {
  createAccountMappingAction,
  deleteAccountMappingAction,
  saveAccountMappingAction,
} from "../../_actions/zadavani"
import { OfficeActionForm } from "../../_components/office-action-form"

/**
 * Zadávání dat › Účty a hotovost (spec §3.3's `account_balance_map`, feeding
 * §2.4's cards).
 *
 * THE HINT UNDER THE HEADING IS LOAD-BEARING. This is the one form in Zadávání
 * dat where the office types NO figure, and an accountant who expects to enter
 * a bank balance here will go looking for the field. Saying "zůstatky se nikam
 * nezadávají, čtou se z předvahy" up front is what makes spec §2.4's "zero
 * extra entry" legible rather than a missing feature.
 *
 * THE ACCOUNT CODE IS NOT EDITABLE, and the edit row renders it as text rather
 * than as a disabled input (a disabled input is a control that looks like it
 * ought to work). Re-pointing an entry at a different účet would rewrite every
 * historical card built from it, so a mis-typed code is deleted and re-entered.
 *
 * RETIRE AND DELETE ARE BOTH OFFERED. Setting Neaktivní hides the account from
 * the client's page while keeping every past card intact; deleting removes it
 * from the history too. A closed bank account wants the first; a typo wants the
 * second.
 */
export function AccountsSection({
  mappings,
  orgSlug,
}: {
  mappings: readonly AccountBalanceMappingView[]
  orgSlug: string
}) {
  const t = useBetaTranslations()

  return (
    <section className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base">
            {t("zadavani.accountCreateTitle")}
          </CardTitle>
          <CardDescription>{t("zadavani.accountsHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <OfficeActionForm
            action={createAccountMappingAction}
            orgSlug={orgSlug}
            submitLabel={t("zadavani.create")}
            className="sm:grid-cols-3"
          >
            <div className="grid gap-2">
              <Label htmlFor="account-code">
                {t("zadavani.fieldAccountCode")}
              </Label>
              <Input
                id="account-code"
                name="accountCode"
                required
                maxLength={20}
                autoComplete="off"
                placeholder="221"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="account-match">
                {t("zadavani.fieldAccountMatch")}
              </Label>
              <NativeSelect
                id="account-match"
                name="matchKind"
                defaultValue="exact"
              >
                {ACCOUNT_MATCH_KINDS.map((matchKind) => (
                  <NativeSelectOption key={matchKind} value={matchKind}>
                    {t(ACCOUNT_MATCH_KIND_LABEL_KEY[matchKind])}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="account-kind">
                {t("zadavani.fieldAccountKind")}
              </Label>
              <NativeSelect id="account-kind" name="kind" defaultValue="bank">
                {ACCOUNT_KINDS.map((kind) => (
                  <NativeSelectOption key={kind} value={kind}>
                    {t(ACCOUNT_KIND_LABEL_KEY[kind])}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>

            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="account-label">
                {t("zadavani.fieldAccountLabel")}
              </Label>
              <Input
                id="account-label"
                name="label"
                required
                maxLength={120}
                placeholder="Fio běžný účet"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="account-sortOrder">
                {t("zadavani.fieldSortOrder")}
              </Label>
              <Input
                id="account-sortOrder"
                name="sortOrder"
                inputMode="numeric"
                defaultValue="0"
              />
            </div>

            {/* A create always makes a live entry; retiring one is an edit. */}
            <input type="hidden" name="active" value="true" />
          </OfficeActionForm>
        </CardContent>
      </Card>

      <h2 className="font-heading text-base font-semibold">
        {t("zadavani.accountsTitle")}
      </h2>

      {mappings.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("zadavani.noRows")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("zadavani.fieldAccountCode")}</TableHead>
              <TableHead>{t("zadavani.fieldActive")}</TableHead>
              <TableHead>{t("zadavani.columnActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mappings.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">
                  <span className="font-mono">{row.accountCode}</span>
                  <span className="block text-xs text-muted-foreground">
                    {row.label} · {t(ACCOUNT_KIND_LABEL_KEY[row.kind])} ·{" "}
                    {t(ACCOUNT_MATCH_KIND_LABEL_KEY[row.matchKind])}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {row.active ? (
                    <Badge variant="outline">{t("zadavani.stateActive")}</Badge>
                  ) : (
                    <Badge variant="secondary">
                      {t("zadavani.stateInactive")}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="grid gap-2">
                    <OfficeActionForm
                      action={saveAccountMappingAction}
                      orgSlug={orgSlug}
                      submitLabel={t("zadavani.save")}
                      submitVariant="outline"
                      layout="row"
                    >
                      <input type="hidden" name="mappingId" value={row.id} />
                      <Input
                        name="label"
                        className="w-48"
                        defaultValue={row.label}
                        maxLength={120}
                        aria-label={t("zadavani.fieldAccountLabel")}
                      />
                      <NativeSelect
                        name="kind"
                        defaultValue={row.kind}
                        aria-label={t("zadavani.fieldAccountKind")}
                      >
                        {ACCOUNT_KINDS.map((kind) => (
                          <NativeSelectOption key={kind} value={kind}>
                            {t(ACCOUNT_KIND_LABEL_KEY[kind])}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                      <NativeSelect
                        name="matchKind"
                        defaultValue={row.matchKind}
                        aria-label={t("zadavani.fieldAccountMatch")}
                      >
                        {ACCOUNT_MATCH_KINDS.map((matchKind) => (
                          <NativeSelectOption key={matchKind} value={matchKind}>
                            {t(ACCOUNT_MATCH_KIND_LABEL_KEY[matchKind])}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                      <Input
                        name="sortOrder"
                        inputMode="numeric"
                        className="w-20"
                        defaultValue={String(row.sortOrder)}
                        aria-label={t("zadavani.fieldSortOrder")}
                      />
                      <NativeSelect
                        name="active"
                        defaultValue={row.active ? "true" : "false"}
                        aria-label={t("zadavani.fieldActive")}
                      >
                        <NativeSelectOption value="true">
                          {t("zadavani.stateActive")}
                        </NativeSelectOption>
                        <NativeSelectOption value="false">
                          {t("zadavani.stateInactive")}
                        </NativeSelectOption>
                      </NativeSelect>
                    </OfficeActionForm>

                    <OfficeActionForm
                      action={deleteAccountMappingAction}
                      orgSlug={orgSlug}
                      submitLabel={t("zadavani.delete")}
                      submitVariant="destructive"
                      layout="row"
                    >
                      <input type="hidden" name="mappingId" value={row.id} />
                    </OfficeActionForm>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  )
}
