import Link from "next/link"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { formatDate } from "@/i18n/format-values"
import { getBetaTranslations } from "@/i18n/translations-server"
import {
  CLIENT_TASK_LINK_KIND_LABEL_KEY,
  clientTaskLinkHref,
} from "@/lib/client-task-labels"
import type { ClientTaskView } from "@/lib/data/projections"

/**
 * "Co od vás potřebujeme" (spec §2.1, item 1) — the client's own read of the
 * open task list, `openClientTasksForScope`'s exact rows in due-date order.
 *
 * A STANDALONE COMPONENT, NOT INLINED INTO `page.tsx`, on purpose: spec §2.1
 * puts this as one card among several on the full Přehled dashboard, and
 * that dashboard (KPI tiles, Nejbližší termíny, first-month state) is PR 20's
 * build. This card is the one piece of it with a real feeder TODAY (this PR
 * is what creates `client_task`), so it ships now rather than as a
 * placeholder — PR 20 imports this exact component instead of rebuilding it.
 *
 * READ-ONLY, entirely. Spec §3.3: "Client pages are read-only for every
 * role" — there is no "mark done" affordance here for any role, owner
 * included; completing a task is an office action from Pro účetní › Úkoly
 * klientovi (`updateClientTask` / `setClientTaskDone`, both `OwnerScope`-gated).
 */
export async function ClientTaskList({
  orgSlug,
  tasks,
}: {
  orgSlug: string
  tasks: readonly ClientTaskView[]
}) {
  const t = await getBetaTranslations()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-lg">
          {t("prehled.tasksTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("prehled.tasksEmpty")}
          </p>
        ) : (
          <ul className="grid gap-3">
            {tasks.map((task) => (
              <li
                key={task.id}
                className="flex items-start justify-between gap-4 border-b border-border-subtle pb-3 last:border-0 last:pb-0"
              >
                <div className="grid gap-1">
                  <p className="text-sm font-medium">{task.title}</p>
                  {task.description ? (
                    <p className="text-sm text-muted-foreground">
                      {task.description}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-xs text-muted-foreground">
                    {formatDate(task.dueDate)}
                  </span>
                  {task.linkKind !== "none" ? (
                    <Link
                      href={clientTaskLinkHref(orgSlug, task.linkKind)}
                      className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                    >
                      {t(CLIENT_TASK_LINK_KIND_LABEL_KEY[task.linkKind])}
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
