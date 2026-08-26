"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { useBetaTranslations } from "@/i18n/translations"
import type { ChatSummary } from "@/lib/data/projections"

import { createChatAction } from "../_actions/chats"

/**
 * The chat list of spec §2.8 ("Sidebar = chat list").
 *
 * IN-PAGE, NOT THE SHELL'S SIDEBAR PANEL. `AppShell`'s `sidebar` prop is
 * unwired in this app on purpose (`app/_shell/beta-shell.tsx`), and every other
 * module with sub-navigation — Dokumenty, Daně, Výkazy, Nastavení — renders its
 * own chrome instead. This follows them rather than being the one module that
 * turns on shell machinery nothing else uses.
 *
 * A CLIENT COMPONENT ONLY FOR `usePathname` — the active-chat highlight. The
 * rows themselves are plain links and the data arrives already projected from
 * the server, so nothing here fetches.
 *
 * An unnamed chat renders the localized placeholder; `title` stays NULL in the
 * database (see `chatSummary`), so "unnamed" and "named 'Nový chat'" remain
 * different facts.
 */
export function ChatList({
  orgSlug,
  chats,
}: {
  orgSlug: string
  chats: readonly ChatSummary[]
}) {
  const t = useBetaTranslations()
  const pathname = usePathname()

  return (
    <nav
      aria-label={t("asistent.listLabel")}
      className="grid content-start gap-2"
    >
      <form action={createChatAction}>
        <input type="hidden" name="orgSlug" value={orgSlug} />
        <Button type="submit" size="sm" className="w-full">
          {t("asistent.newChat")}
        </Button>
      </form>

      {chats.length === 0 ? (
        <p className="px-2 py-4 text-sm text-muted-foreground">
          {t("asistent.listEmpty")}
        </p>
      ) : (
        <ul className="grid gap-1">
          {chats.map((chat) => {
            const href = `/${orgSlug}/asistent/${chat.id}`
            return (
              <li key={chat.id}>
                <Link
                  href={href}
                  aria-current={pathname === href ? "page" : undefined}
                  className={cn(
                    "block truncate rounded-md px-2 py-1.5 text-sm hover:bg-accent",
                    pathname === href && "bg-accent font-medium",
                  )}
                >
                  {chat.title ?? t("asistent.untitled")}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </nav>
  )
}
