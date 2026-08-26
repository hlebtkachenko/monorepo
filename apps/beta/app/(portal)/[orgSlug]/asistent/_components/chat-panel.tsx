"use client"

import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"
import { cn } from "@workspace/ui/lib/utils"

import { useBetaTranslations } from "@/i18n/translations"
import type { BetaMessageKey } from "@/i18n/messages"
import type { ChatMessageView } from "@/lib/data/projections"

/**
 * The conversation itself: transcript, composer, streamed reply (spec §2.8).
 *
 * THE DISCLAIMER APPEARS TWICE, as the spec requires: above the composer, and
 * attached to the FIRST assistant message. It is RENDERED in both places rather
 * than stored in the transcript — a disclaimer written into `chat_message`
 * would put Czech UI copy in the database, would be un-editable afterwards
 * (`chat_message_is_append_only`), and would be sent back to the model as
 * context on every later turn.
 *
 * ERROR CODES IN, CZECH OUT. The route emits `{"type":"error","code":...}`; the
 * map below is the one place a code becomes a sentence. An unrecognised code
 * falls back to the generic failure string rather than rendering the raw code
 * to a client.
 *
 * NO OPTIMISTIC TRANSCRIPT REWRITES. The user's message is appended locally the
 * moment it is sent because the server has already stored it by the time the
 * first byte comes back; the assistant's message grows from the deltas. On a
 * failure the partial answer stays on screen — it is what the client read, and
 * it is what the server stored.
 */

const ERROR_MESSAGE_KEY: Record<string, BetaMessageKey> = {
  daily_limit: "asistent.errorDailyLimit",
  monthly_budget: "asistent.errorMonthlyBudget",
  message_too_long: "asistent.errorTooLong",
  provider_unconfigured: "asistent.errorUnavailable",
  provider_unauthorized: "asistent.errorUnavailable",
  provider_rate_limited: "asistent.errorBusy",
  provider_refused: "asistent.errorRefused",
  provider_unreachable: "asistent.errorNetwork",
  provider_error: "asistent.errorGeneric",
  not_found: "asistent.errorGeneric",
  invalid_body: "asistent.errorGeneric",
  empty_message: "asistent.errorGeneric",
  cross_site: "asistent.errorGeneric",
  tenancy_keys_forbidden: "asistent.errorGeneric",
}

type Turn = { id: string; role: "user" | "assistant"; content: string }

export function ChatPanel({
  orgSlug,
  chatId,
  initialMessages,
  maxInputChars,
}: {
  orgSlug: string
  chatId: string
  initialMessages: readonly ChatMessageView[]
  maxInputChars: number
}) {
  const t = useBetaTranslations()
  const [turns, setTurns] = React.useState<Turn[]>(() =>
    initialMessages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
    })),
  )
  const [draft, setDraft] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [errorKey, setErrorKey] = React.useState<BetaMessageKey | null>(null)

  const firstAssistantId = turns.find((turn) => turn.role === "assistant")?.id

  async function send(): Promise<void> {
    const text = draft.trim()
    if (text === "" || pending) return

    setPending(true)
    setErrorKey(null)
    setDraft("")

    const replyId = `reply-${Date.now()}`
    setTurns((previous) => [
      ...previous,
      { id: `ask-${Date.now()}`, role: "user", content: text },
      { id: replyId, role: "assistant", content: "" },
    ])

    const fail = (code: string): void => {
      setErrorKey(ERROR_MESSAGE_KEY[code] ?? "asistent.errorGeneric")
    }

    try {
      const response = await fetch(`/api/orgs/${orgSlug}/asistent`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chatId, message: text }),
      })

      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => null)) as {
          error?: string
        } | null
        fail(body?.error ?? "provider_error")
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        let newline = buffer.indexOf("\n")
        while (newline !== -1) {
          const line = buffer.slice(0, newline)
          buffer = buffer.slice(newline + 1)
          newline = buffer.indexOf("\n")
          if (line.trim() === "") continue

          let frame: { type?: string; text?: string; code?: string }
          try {
            frame = JSON.parse(line)
          } catch {
            continue
          }

          if (frame.type === "delta" && typeof frame.text === "string") {
            const chunk = frame.text
            setTurns((previous) =>
              previous.map((turn) =>
                turn.id === replyId
                  ? { ...turn, content: turn.content + chunk }
                  : turn,
              ),
            )
          } else if (frame.type === "error") {
            fail(frame.code ?? "provider_error")
          }
        }
      }
    } catch {
      fail("provider_unreachable")
    } finally {
      setPending(false)
      // An assistant turn that produced nothing is removed rather than left as
      // an empty bubble — the error line above already says what happened.
      setTurns((previous) =>
        previous.filter(
          (turn) => turn.id !== replyId || turn.content.trim() !== "",
        ),
      )
    }
  }

  return (
    <div className="grid content-start gap-4">
      <ol className="grid gap-4" aria-live="polite">
        {turns.map((turn) => (
          <li key={turn.id} className="grid gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              {turn.role === "user"
                ? t("asistent.roleUser")
                : t("asistent.roleAssistant")}
            </span>
            <div
              className={cn(
                "rounded-md border border-border/60 px-3 py-2 text-sm whitespace-pre-wrap",
                turn.role === "user" ? "bg-muted/40" : "bg-card",
              )}
            >
              {turn.content}
            </div>
            {turn.role === "assistant" && turn.id === firstAssistantId ? (
              <p className="text-xs text-muted-foreground">
                {t("asistent.disclaimer")}
              </p>
            ) : null}
          </li>
        ))}
      </ol>

      {turns.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("asistent.chatEmpty")}
        </p>
      ) : null}

      {errorKey ? (
        <p role="alert" className="text-sm text-destructive">
          {t(errorKey)}
        </p>
      ) : null}

      <div className="grid gap-2">
        <p className="text-xs text-muted-foreground">
          {t("asistent.disclaimer")}
        </p>
        <Textarea
          value={draft}
          onChange={(event) =>
            setDraft(event.target.value.slice(0, maxInputChars))
          }
          rows={3}
          maxLength={maxInputChars}
          placeholder={t("asistent.composerPlaceholder")}
          aria-label={t("asistent.composerLabel")}
          disabled={pending}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            {draft.length} / {maxInputChars}
          </span>
          <Button
            type="button"
            size="sm"
            disabled={pending || draft.trim() === ""}
            onClick={() => void send()}
          >
            {pending ? t("asistent.sending") : t("asistent.send")}
          </Button>
        </div>
      </div>
    </div>
  )
}
