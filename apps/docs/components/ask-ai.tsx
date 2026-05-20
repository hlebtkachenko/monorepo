"use client"

import { useState } from "react"

interface Message {
  role: "user" | "assistant"
  text: string
}

/**
 * Minimal Ask AI chat surface. POSTs to `/api/ask`, consumes the SSE
 * stream emitted by the route handler, appends deltas to the running
 * assistant message in real time. No history persistence — each thread
 * lives in memory until reload.
 */
export function AskAI() {
  const [messages, setMessages] = useState<Message[]>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [input, setInput] = useState("")

  async function ask(question: string) {
    setPending(true)
    setError(null)
    setMessages((m) => [
      ...m,
      { role: "user", text: question },
      { role: "assistant", text: "" },
    ])
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string }
        } | null
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`)
      }
      if (!res.body) throw new Error("Empty response stream")
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let nl: number
        while ((nl = buffer.indexOf("\n\n")) !== -1) {
          const raw = buffer.slice(0, nl).trim()
          buffer = buffer.slice(nl + 2)
          if (!raw.startsWith("data: ")) continue
          const payload = raw.slice("data: ".length)
          if (payload === "[DONE]") return
          try {
            const parsed = JSON.parse(payload) as {
              text?: string
              error?: string
            }
            if (parsed.error) throw new Error(parsed.error)
            if (parsed.text) {
              setMessages((m) => {
                const next = [...m]
                const last = next[next.length - 1]
                if (last?.role === "assistant") {
                  next[next.length - 1] = {
                    ...last,
                    text: last.text + parsed.text,
                  }
                }
                return next
              })
            }
          } catch (e) {
            throw e instanceof Error ? e : new Error(String(e))
          }
        }
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <header className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Ask AI</h2>
        <span className="text-xs text-muted-foreground">
          Powered by Claude Haiku 4.5 · cited answers from the docs corpus
        </span>
      </header>
      <div className="flex max-h-[480px] min-h-[120px] flex-col gap-3 overflow-y-auto text-sm">
        {messages.length === 0 ? (
          <p className="text-muted-foreground">
            Try: <em>"How do I verify a webhook?"</em> ·{" "}
            <em>"What's the rate-limit header?"</em>
          </p>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === "user"
                  ? "max-w-[80%] self-end rounded-lg bg-primary px-3 py-2 text-primary-foreground"
                  : "max-w-[80%] self-start rounded-lg bg-muted px-3 py-2 whitespace-pre-wrap"
              }
            >
              {m.text || (pending ? "…" : "")}
            </div>
          ))
        )}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!input.trim() || pending) return
          void ask(input.trim())
          setInput("")
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question…"
          maxLength={1_000}
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
          disabled={pending}
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition disabled:opacity-50"
        >
          {pending ? "…" : "Ask"}
        </button>
      </form>
    </section>
  )
}
