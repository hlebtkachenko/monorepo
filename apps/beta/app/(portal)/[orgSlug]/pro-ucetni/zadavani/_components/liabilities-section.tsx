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
import { Textarea } from "@workspace/ui/components/textarea"

import { useBetaTranslations } from "@/i18n/translations"
import type { LiabilityView } from "@/lib/data/projections"
import { formatDate } from "@/lib/format/date"
import { formatAmount } from "@/lib/format/money"
import {
  MANUAL_OBLIGATION_GROUPS,
  OBLIGATION_GROUP_LABEL_KEY,
} from "@/lib/obligation-labels"

import { SectionTitle } from "../../../../../_components/page-header"

import {
  createLiabilityAction,
  deleteLiabilityAction,
  saveLiabilityAction,
  setLiabilityPaidAction,
} from "../../_actions/zadavani"
import { OfficeActionForm } from "../../_components/office-action-form"

/**
 * Zadávání dat › Ostatní závazky (spec §3.3, §2.4's manual residue).
 *
 * THE HINT UNDER THE HEADING IS LOAD-BEARING, not decoration. This table is the
 * RESIDUE — what neither the filing registry nor the imported saldokonto can
 * express — and the whole derived read model exists because liabilities used to
 * be typed three times over (Advisor defect F11). Telling the office what
 * belongs here is what keeps them from re-typing a DPH amount that the filing
 * beside it already carries.
 *
 * THE GROUP SELECT OFFERS THREE OF THE FOUR CREDITOR GROUPS.
 * `MANUAL_OBLIGATION_GROUPS` omits `dodavatele`, which belongs wholly to PR 28's
 * saldokonto import — the database refuses it either way
 * (`liability_group_is_residue`), and offering an option whose only outcome is a
 * constraint violation would be a worse way to say the same thing.
 *
 * EVERY FIELD IS EDITABLE, unlike a filing's. A liability has no identity
 * columns: it is a free-text row the office typed, stamped with no period, and
 * nothing points at it — so correcting a typo IS an edit (see `LiabilityPatch`).
 */
export function LiabilitiesSection({
  liabilities,
  orgSlug,
}: {
  liabilities: readonly LiabilityView[]
  orgSlug: string
}) {
  const t = useBetaTranslations()

  return (
    <section className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base">
            {t("zadavani.liabilityCreateTitle")}
          </CardTitle>
          <CardDescription>{t("zadavani.liabilitiesHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <OfficeActionForm
            action={createLiabilityAction}
            orgSlug={orgSlug}
            submitLabel={t("zadavani.create")}
            className="sm:grid-cols-3"
          >
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="liability-label">
                {t("zadavani.fieldLabel")}
              </Label>
              <Input id="liability-label" name="label" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="liability-group">
                {t("zadavani.fieldGroup")}
              </Label>
              <NativeSelect
                id="liability-group"
                name="group"
                defaultValue="ostatni"
              >
                {MANUAL_OBLIGATION_GROUPS.map((group) => (
                  <NativeSelectOption key={group} value={group}>
                    {t(OBLIGATION_GROUP_LABEL_KEY[group])}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="liability-amount">
                {t("zadavani.fieldAmount")}
              </Label>
              <Input
                id="liability-amount"
                name="amount"
                inputMode="decimal"
                required
                placeholder="0,00"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="liability-dueOn">
                {t("zadavani.fieldDueOn")}
              </Label>
              <Input id="liability-dueOn" name="dueOn" type="date" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="liability-variableSymbol">
                {t("zadavani.fieldVariableSymbol")}
              </Label>
              <Input
                id="liability-variableSymbol"
                name="variableSymbol"
                inputMode="numeric"
              />
            </div>

            <div className="grid gap-2 sm:col-span-3">
              <Label htmlFor="liability-noteClient">
                {t("zadavani.fieldNoteClient")}
              </Label>
              <Textarea id="liability-noteClient" name="noteClient" rows={2} />
            </div>
            <div className="grid gap-2 sm:col-span-3">
              <Label htmlFor="liability-noteInternal">
                {t("zadavani.fieldNoteInternal")}
              </Label>
              <Textarea
                id="liability-noteInternal"
                name="noteInternal"
                rows={2}
              />
            </div>
          </OfficeActionForm>
        </CardContent>
      </Card>

      <SectionTitle>{t("zadavani.liabilitiesTitle")}</SectionTitle>

      {liabilities.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("zadavani.noRows")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("zadavani.columnTitle")}</TableHead>
              <TableHead>{t("zadavani.columnState")}</TableHead>
              <TableHead>{t("zadavani.columnActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {liabilities.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">
                  {row.label}
                  <span className="block text-xs text-muted-foreground">
                    {t(OBLIGATION_GROUP_LABEL_KEY[row.group])} ·{" "}
                    {formatDate(row.dueOn)} · {formatAmount(row.amount)}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {row.paidAt !== null ? (
                    <Badge variant="secondary">{t("zadavani.statePaid")}</Badge>
                  ) : row.overdue ? (
                    <Badge variant="destructive">
                      {t("zadavani.stateOverdue")}
                    </Badge>
                  ) : (
                    <Badge variant="outline">{t("zadavani.stateOpen")}</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="grid gap-2">
                    <OfficeActionForm
                      action={saveLiabilityAction}
                      orgSlug={orgSlug}
                      submitLabel={t("zadavani.save")}
                      submitVariant="outline"
                      layout="row"
                    >
                      <input type="hidden" name="liabilityId" value={row.id} />
                      <Input
                        name="label"
                        className="w-48"
                        defaultValue={row.label}
                        aria-label={t("zadavani.fieldLabel")}
                      />
                      <NativeSelect
                        name="group"
                        defaultValue={row.group}
                        aria-label={t("zadavani.fieldGroup")}
                      >
                        {MANUAL_OBLIGATION_GROUPS.map((group) => (
                          <NativeSelectOption key={group} value={group}>
                            {t(OBLIGATION_GROUP_LABEL_KEY[group])}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                      <Input
                        name="amount"
                        inputMode="decimal"
                        className="w-32"
                        defaultValue={row.amount}
                        aria-label={t("zadavani.fieldAmount")}
                      />
                      <Input
                        name="dueOn"
                        type="date"
                        className="w-40"
                        defaultValue={row.dueOn}
                        aria-label={t("zadavani.fieldDueOn")}
                      />
                      <Input
                        name="variableSymbol"
                        inputMode="numeric"
                        className="w-32"
                        defaultValue={row.variableSymbol ?? ""}
                        aria-label={t("zadavani.fieldVariableSymbol")}
                      />
                    </OfficeActionForm>

                    <div className="flex flex-wrap gap-2">
                      <OfficeActionForm
                        action={setLiabilityPaidAction}
                        orgSlug={orgSlug}
                        submitLabel={
                          row.paidAt === null
                            ? t("zadavani.markPaid")
                            : t("zadavani.markUnpaid")
                        }
                        submitVariant="outline"
                        layout="row"
                      >
                        <input
                          type="hidden"
                          name="liabilityId"
                          value={row.id}
                        />
                        <input
                          type="hidden"
                          name="paid"
                          value={row.paidAt === null ? "true" : "false"}
                        />
                      </OfficeActionForm>

                      <OfficeActionForm
                        action={deleteLiabilityAction}
                        orgSlug={orgSlug}
                        submitLabel={t("zadavani.delete")}
                        submitVariant="destructive"
                        layout="row"
                      >
                        <input
                          type="hidden"
                          name="liabilityId"
                          value={row.id}
                        />
                      </OfficeActionForm>
                    </div>
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
