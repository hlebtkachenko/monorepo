"use client"

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

import { betaClientTaskLinkKind } from "@/db/schema"
import { useBetaTranslations } from "@/i18n/translations"
import { CLIENT_TASK_LINK_KIND_LABEL_KEY } from "@/lib/client-task-labels"
import type { OwnerClientTaskDetail } from "@/lib/data/projections"

import {
  createClientTaskTemplateAction,
  deleteClientTaskTemplateAction,
  saveClientTaskTemplateAction,
} from "../../_actions/client-tasks"
import { OfficeActionForm } from "../../_components/office-action-form"
import { MonthlySetDialog } from "./monthly-set-dialog"

/**
 * Pro účetní › Úkoly klientovi's "Šablony" tab (spec §3.4): task templates —
 * `is_template = true` rows with a `templateDueDay` instead of a real
 * `dueDate`. "Vytvořit měsíční sadu úkolů" reads this list, so the dialog
 * lives right beside it rather than floating in the page header.
 */
export function TemplatesSection({
  templates,
  orgSlug,
}: {
  templates: readonly OwnerClientTaskDetail[]
  orgSlug: string
}) {
  const t = useBetaTranslations()

  return (
    <section className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base">
            {t("ukoly.templateCreateTitle")}
          </CardTitle>
          <CardDescription>{t("ukoly.templatesHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <OfficeActionForm
            action={createClientTaskTemplateAction}
            orgSlug={orgSlug}
            submitLabel={t("ukoly.create")}
            className="sm:grid-cols-3"
          >
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="template-title">{t("ukoly.fieldTitle")}</Label>
              <Input id="template-title" name="title" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="template-dueDay">
                {t("ukoly.fieldTemplateDueDay")}
              </Label>
              <Input
                id="template-dueDay"
                name="templateDueDay"
                type="number"
                min={1}
                max={31}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="template-linkKind">
                {t("ukoly.fieldLinkKind")}
              </Label>
              <NativeSelect
                id="template-linkKind"
                name="linkKind"
                defaultValue="none"
              >
                {betaClientTaskLinkKind.enumValues.map((kind) => (
                  <NativeSelectOption key={kind} value={kind}>
                    {t(CLIENT_TASK_LINK_KIND_LABEL_KEY[kind])}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-2 sm:col-span-3">
              <Label htmlFor="template-description">
                {t("ukoly.fieldDescription")}
              </Label>
              <Textarea id="template-description" name="description" rows={2} />
            </div>
          </OfficeActionForm>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-base font-semibold">
          {t("ukoly.templatesTitle")}
        </h2>
        <MonthlySetDialog orgSlug={orgSlug} />
      </div>

      {templates.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("ukoly.noRows")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("ukoly.columnTitle")}</TableHead>
              <TableHead>{t("ukoly.columnTemplateDueDay")}</TableHead>
              <TableHead>{t("ukoly.columnActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((template) => (
              <TableRow key={template.id}>
                <TableCell className="font-medium">
                  {template.title}
                  <span className="block text-xs text-muted-foreground">
                    {t(CLIENT_TASK_LINK_KIND_LABEL_KEY[template.linkKind])}
                  </span>
                </TableCell>
                <TableCell>{template.templateDueDay}</TableCell>
                <TableCell>
                  <div className="grid gap-2">
                    <OfficeActionForm
                      action={saveClientTaskTemplateAction}
                      orgSlug={orgSlug}
                      submitLabel={t("ukoly.save")}
                      submitVariant="outline"
                      layout="row"
                    >
                      <input
                        type="hidden"
                        name="templateId"
                        value={template.id}
                      />
                      <Input
                        name="title"
                        className="w-48"
                        defaultValue={template.title}
                        aria-label={t("ukoly.fieldTitle")}
                      />
                      <Input
                        name="templateDueDay"
                        type="number"
                        min={1}
                        max={31}
                        className="w-24"
                        defaultValue={template.templateDueDay ?? ""}
                        aria-label={t("ukoly.fieldTemplateDueDay")}
                      />
                      <NativeSelect
                        name="linkKind"
                        defaultValue={template.linkKind}
                        aria-label={t("ukoly.fieldLinkKind")}
                      >
                        {betaClientTaskLinkKind.enumValues.map((kind) => (
                          <NativeSelectOption key={kind} value={kind}>
                            {t(CLIENT_TASK_LINK_KIND_LABEL_KEY[kind])}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                      <Textarea
                        name="description"
                        rows={1}
                        className="w-56"
                        defaultValue={template.description ?? ""}
                        aria-label={t("ukoly.fieldDescription")}
                      />
                    </OfficeActionForm>

                    <OfficeActionForm
                      action={deleteClientTaskTemplateAction}
                      orgSlug={orgSlug}
                      submitLabel={t("ukoly.delete")}
                      submitVariant="destructive"
                      layout="row"
                    >
                      <input
                        type="hidden"
                        name="templateId"
                        value={template.id}
                      />
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
