import type { ReactNode } from "react"

import { getBetaTranslations } from "@/i18n/translations-server"
import { assertAssistantAvailable, chatsForScope } from "@/lib/data/assistant"

import { resolveOrgScope } from "../_lib/org-scope"

import { ChatList } from "./_components/chat-list"

/**
 * The Asistent tree (spec §2.8): the module header, the chat list, and
 * whichever conversation is open beside it.
 *
 * `assertAssistantAvailable` IS THE GATE FOR THE WHOLE SUBTREE. It answers 404
 * when `BETA_ASSISTANT_ENABLED` is not exactly "true" and when the viewer's
 * role may not use the feature (spec §5: not guest, and therefore not the
 * employee seat). Both refusals are the same 404, so a bookmarked URL reveals
 * neither the module's existence nor the state of the exposure flag.
 *
 * IT IS NOT THE ONLY GATE. Each page below re-proves it against its own
 * `resolveOrgScope`, and every Server Action and the chat route do the same on
 * their own requests — a layout cannot be the security boundary for a request
 * it does not participate in.
 */
export default async function AsistentLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const scope = await resolveOrgScope(orgSlug)
  assertAssistantAvailable(scope)

  const [chats, t] = await Promise.all([
    chatsForScope(scope),
    getBetaTranslations(),
  ])

  return (
    <div className="flex flex-col">
      <header className="grid gap-1 px-6 pt-6">
        <h1 className="font-heading text-xl font-semibold">
          {t("asistent.title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("asistent.intro")}</p>
      </header>
      <div className="grid gap-6 p-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <ChatList orgSlug={orgSlug} chats={chats} />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  )
}
