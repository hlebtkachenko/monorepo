import { getBetaTranslations } from "@/i18n/translations-server"

import { TasksSection } from "./_components/tasks-section"
import { TemplatesSection } from "./_components/templates-section"
import { loadUkoly } from "./_lib/load-ukoly"

/**
 * Pro účetní › Úkoly klientovi (spec §3.4): client_task CRUD, templates, and
 * "Vytvořit měsíční sadu úkolů". Mirrors `zadavani/page.tsx`'s own shape: no
 * gate in this file — `loadUkoly` opens with `requireOwner`, and it is the
 * function `load-ukoly.db.test.ts` calls, not this component (a Next page
 * cannot be invoked in a test runner without a request context).
 */
export default async function UkolyPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug: requested } = await params
  const [t, { orgSlug, tasks, templates }] = await Promise.all([
    getBetaTranslations(),
    loadUkoly(requested),
  ])

  return (
    <div className="grid gap-8 p-6">
      <header className="grid gap-1">
        <h1 className="font-heading text-xl font-semibold">
          {t("ukoly.title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("ukoly.intro")}</p>
      </header>

      <TasksSection tasks={tasks} orgSlug={orgSlug} />
      <TemplatesSection templates={templates} orgSlug={orgSlug} />
    </div>
  )
}
