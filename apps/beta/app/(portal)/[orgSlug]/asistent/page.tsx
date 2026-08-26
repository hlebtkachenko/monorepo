import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"

import { getBetaTranslations } from "@/i18n/translations-server"
import { assertAssistantAvailable } from "@/lib/data/assistant"

import { resolveOrgScope } from "../_lib/org-scope"

import { createChatAction } from "./_actions/chats"

/**
 * The Asistent landing state — no conversation open.
 *
 * Deliberately NOT a redirect into the most recent chat: spec §2.8 makes "Nový
 * chat" the primary act, and silently reopening the last conversation would put
 * an old transcript on screen for someone who came here to ask something new.
 * The list beside it (rendered by the layout) is one click away.
 */
export default async function AsistentPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  assertAssistantAvailable(await resolveOrgScope(orgSlug))
  const t = await getBetaTranslations()

  return (
    <Card>
      <CardContent className="grid gap-4 py-8 text-center">
        <div className="grid gap-1">
          <p className="font-medium">{t("asistent.emptyHeading")}</p>
          <p className="text-sm text-muted-foreground">
            {t("asistent.emptyBody")}
          </p>
        </div>
        <form action={createChatAction} className="justify-self-center">
          <input type="hidden" name="orgSlug" value={orgSlug} />
          <Button type="submit" size="sm">
            {t("asistent.newChat")}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          {t("asistent.disclaimer")}
        </p>
      </CardContent>
    </Card>
  )
}
