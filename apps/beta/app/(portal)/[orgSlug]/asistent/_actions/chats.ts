"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

import {
  assertAssistantAvailable,
  createChat,
  deleteChat,
  renameChat,
} from "@/lib/data/assistant"
import { requireScope } from "@/lib/data/scope"

/**
 * The three chat-list writes of spec §2.8: "Nový chat, rename, delete".
 *
 * `assertAssistantAvailable(await requireScope(orgSlug))` IS THE FIRST
 * STATEMENT of every action, the same shape Majetek's actions use for
 * `requireOwner`: the env gate and the guest/employee-seat exclusion are
 * re-proved on the action's OWN request, because a Server Action is a request
 * of its own and a page's memoized scope does not reach it. A rail entry that
 * has since been switched off must not leave a live write behind it.
 *
 * No `ActionState` machinery: these three take no free-form input worth
 * validating beyond a title's length (which `renameChat` and the
 * `chat_title_shape` CHECK both bound), and they redirect or revalidate rather
 * than render an error into a form. `renameChat` / `deleteChat` answering
 * `false` means the chat is not this person's — indistinguishable from "no such
 * chat", deliberately — and the revalidated list is the honest answer to both.
 */

export async function createChatAction(formData: FormData): Promise<void> {
  const orgSlug = String(formData.get("orgSlug") ?? "")
  const scope = await requireScope(orgSlug)
  assertAssistantAvailable(scope)

  const created = await createChat(scope)
  revalidatePath(`/${orgSlug}/asistent`)
  redirect(`/${orgSlug}/asistent/${created.id}`)
}

export async function renameChatAction(formData: FormData): Promise<void> {
  const orgSlug = String(formData.get("orgSlug") ?? "")
  const chatId = String(formData.get("chatId") ?? "")
  const scope = await requireScope(orgSlug)
  assertAssistantAvailable(scope)

  await renameChat(scope, chatId, String(formData.get("title") ?? ""))
  revalidatePath(`/${orgSlug}/asistent`)
  revalidatePath(`/${orgSlug}/asistent/${chatId}`)
}

export async function deleteChatAction(formData: FormData): Promise<void> {
  const orgSlug = String(formData.get("orgSlug") ?? "")
  const chatId = String(formData.get("chatId") ?? "")
  const scope = await requireScope(orgSlug)
  assertAssistantAvailable(scope)

  await deleteChat(scope, chatId)
  revalidatePath(`/${orgSlug}/asistent`)
  redirect(`/${orgSlug}/asistent`)
}
