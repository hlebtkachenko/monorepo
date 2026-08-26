import { notFound } from "next/navigation"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"

import { getBetaTranslations } from "@/i18n/translations-server"
import { readAssistantConfig } from "@/lib/assistant/config"
import { assertAssistantAvailable, chatForScope } from "@/lib/data/assistant"

import { resolveOrgScope } from "../../_lib/org-scope"

import { deleteChatAction, renameChatAction } from "../_actions/chats"
import { ChatPanel } from "../_components/chat-panel"

/**
 * One conversation (spec §2.8).
 *
 * `chatForScope` answers `null` identically for an unknown id, a chat in
 * another book, and a chat belonging to another person in THIS book — one
 * query, one outcome, one 404. That third case is the one this module adds over
 * every other org-scoped page: a member must not read a colleague's questions,
 * and the URL space must not tell them whether those questions exist.
 *
 * Rename and delete are plain forms, not a dropdown: they are two writes with
 * one field between them, and the spec's chat list asks for nothing more.
 */
export default async function AsistentChatPage({
  params,
}: {
  params: Promise<{ orgSlug: string; chatId: string }>
}) {
  const { orgSlug, chatId } = await params
  const scope = await resolveOrgScope(orgSlug)
  assertAssistantAvailable(scope)

  const [detail, t] = await Promise.all([
    chatForScope(scope, chatId),
    getBetaTranslations(),
  ])
  if (!detail) notFound()

  const config = readAssistantConfig()

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form action={renameChatAction} className="flex items-end gap-2">
          <input type="hidden" name="orgSlug" value={orgSlug} />
          <input type="hidden" name="chatId" value={chatId} />
          <Input
            name="title"
            defaultValue={detail.chat.title ?? ""}
            maxLength={120}
            aria-label={t("asistent.renameLabel")}
            placeholder={t("asistent.untitled")}
            className="w-64"
          />
          <Button type="submit" variant="outline" size="sm">
            {t("asistent.rename")}
          </Button>
        </form>
        <form action={deleteChatAction}>
          <input type="hidden" name="orgSlug" value={orgSlug} />
          <input type="hidden" name="chatId" value={chatId} />
          <Button type="submit" variant="outline" size="sm">
            {t("asistent.delete")}
          </Button>
        </form>
      </div>

      {config.providerConfigured ? null : (
        <p role="status" className="text-sm text-muted-foreground">
          {t("asistent.errorUnavailable")}
        </p>
      )}

      <ChatPanel
        orgSlug={orgSlug}
        chatId={chatId}
        initialMessages={detail.messages}
        maxInputChars={config.maxInputChars}
      />
    </div>
  )
}
