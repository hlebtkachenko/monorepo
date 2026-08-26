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

import { formatDate } from "@/i18n/format-values"
import { useBetaTranslations } from "@/i18n/translations"
import { betaClientTaskLinkKind } from "@/db/schema"
import {
  CLIENT_TASK_LINK_KIND_LABEL_KEY,
  CLIENT_TASK_STATUS_LABEL_KEY,
} from "@/lib/client-task-labels"
import type { OwnerClientTaskDetail } from "@/lib/data/projections"

import { SectionTitle } from "../../../../../_components/page-header"

import {
  createClientTaskAction,
  deleteClientTaskAction,
  saveClientTaskAction,
  setClientTaskDoneAction,
} from "../../_actions/client-tasks"
import { OfficeActionForm } from "../../_components/office-action-form"

/**
 * Pro účetní › Úkoly klientovi's "Úkoly" tab (spec §3.4): real, dated tasks —
 * the twin of `zadavani`'s `LiabilitiesSection`, same create-card-over-editable-
 * table shape. Every field is editable inline, the same reasoning
 * `LiabilitiesSection` gives: a task has no identity columns the way a filing
 * does, so a typo IS an edit rather than a delete-and-re-enter.
 *
 * `generatedFromTemplate` renders a small badge rather than a disabled row —
 * a task the monthly-set button created is still an ordinary task once it
 * exists, editable and deletable like any other (spec §3.4 says nothing that
 * would freeze it).
 */
export function TasksSection({
  tasks,
  orgSlug,
}: {
  tasks: readonly OwnerClientTaskDetail[]
  orgSlug: string
}) {
  const t = useBetaTranslations()

  return (
    <section className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base">
            {t("ukoly.taskCreateTitle")}
          </CardTitle>
          <CardDescription>{t("ukoly.tasksHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <OfficeActionForm
            action={createClientTaskAction}
            orgSlug={orgSlug}
            submitLabel={t("ukoly.create")}
            className="sm:grid-cols-3"
          >
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="task-title">{t("ukoly.fieldTitle")}</Label>
              <Input id="task-title" name="title" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="task-dueDate">{t("ukoly.fieldDueDate")}</Label>
              <Input id="task-dueDate" name="dueDate" type="date" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="task-linkKind">{t("ukoly.fieldLinkKind")}</Label>
              <NativeSelect
                id="task-linkKind"
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
              <Label htmlFor="task-description">
                {t("ukoly.fieldDescription")}
              </Label>
              <Textarea id="task-description" name="description" rows={2} />
            </div>
          </OfficeActionForm>
        </CardContent>
      </Card>

      <SectionTitle>{t("ukoly.tasksTitle")}</SectionTitle>

      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("ukoly.noRows")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("ukoly.columnTitle")}</TableHead>
              <TableHead>{t("ukoly.columnStatus")}</TableHead>
              <TableHead>{t("ukoly.columnActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((task) => (
              <TableRow key={task.id}>
                <TableCell className="font-medium">
                  {task.title}
                  {task.generatedFromTemplate ? (
                    <Badge variant="outline" className="ml-2 align-middle">
                      {t("ukoly.generatedBadge")}
                    </Badge>
                  ) : null}
                  <span className="block text-xs text-muted-foreground">
                    {task.dueDate ? formatDate(task.dueDate) : "—"} ·{" "}
                    {t(CLIENT_TASK_LINK_KIND_LABEL_KEY[task.linkKind])}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <Badge
                    variant={task.status === "done" ? "secondary" : "outline"}
                  >
                    {t(CLIENT_TASK_STATUS_LABEL_KEY[task.status])}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="grid gap-2">
                    <OfficeActionForm
                      action={saveClientTaskAction}
                      orgSlug={orgSlug}
                      submitLabel={t("ukoly.save")}
                      submitVariant="outline"
                      layout="row"
                    >
                      <input type="hidden" name="taskId" value={task.id} />
                      <Input
                        name="title"
                        className="w-48"
                        defaultValue={task.title}
                        aria-label={t("ukoly.fieldTitle")}
                      />
                      <Input
                        name="dueDate"
                        type="date"
                        className="w-40"
                        defaultValue={task.dueDate ?? ""}
                        aria-label={t("ukoly.fieldDueDate")}
                      />
                      <NativeSelect
                        name="linkKind"
                        defaultValue={task.linkKind}
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
                        defaultValue={task.description ?? ""}
                        aria-label={t("ukoly.fieldDescription")}
                      />
                    </OfficeActionForm>

                    <div className="flex flex-wrap gap-2">
                      <OfficeActionForm
                        action={setClientTaskDoneAction}
                        orgSlug={orgSlug}
                        submitLabel={
                          task.status === "done"
                            ? t("ukoly.reopen")
                            : t("ukoly.markDone")
                        }
                        submitVariant="outline"
                        layout="row"
                      >
                        <input type="hidden" name="taskId" value={task.id} />
                        <input
                          type="hidden"
                          name="done"
                          value={task.status === "done" ? "false" : "true"}
                        />
                      </OfficeActionForm>

                      <OfficeActionForm
                        action={deleteClientTaskAction}
                        orgSlug={orgSlug}
                        submitLabel={t("ukoly.delete")}
                        submitVariant="destructive"
                        layout="row"
                      >
                        <input type="hidden" name="taskId" value={task.id} />
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
