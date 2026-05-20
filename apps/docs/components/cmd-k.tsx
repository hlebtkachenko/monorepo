"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

/**
 * Cmd-K search modal backed by the Pagefind index.
 *
 * Index is generated at build time by `pnpm --filter docs build:pagefind`
 * and served from `/public/_pagefind/`. We lazy-load the client when the
 * modal opens so the index (~hundreds of KB) doesn't sit in the main
 * bundle.
 *
 * Hotkey: Cmd-K / Ctrl-K toggles the modal. Esc closes.
 */

interface PagefindResult {
  id: string
  data: () => Promise<{
    url: string
    meta: { title?: string }
    excerpt: string
  }>
}

interface PagefindAPI {
  search: (q: string) => Promise<{ results: PagefindResult[] }>
}

interface Hit {
  url: string
  title: string
  excerpt: string
}

export function CmdK() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<Hit[]>([])
  const [api, setApi] = useState<PagefindAPI | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((v) => !v)
      } else if (e.key === "Escape") {
        setOpen(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    if (!open || api) return
    let cancelled = false
    ;(async () => {
      try {
        // Bypass bundler resolution: pagefind ships as a static asset at
        // `/public/_pagefind/pagefind.js`, written by the `build:pagefind`
        // post-build step. Both Webpack and Turbopack try to resolve a
        // string-literal `import(...)` at build time; constructing the
        // call through `Function` keeps it dynamic.
        const loader = new Function("p", "return import(p)") as (
          p: string,
        ) => Promise<PagefindAPI>
        const mod = await loader("/_pagefind/pagefind.js")
        if (!cancelled) setApi(mod)
      } catch (e) {
        if (!cancelled) {
          setLoadError(
            "Search index not built yet. Run `pnpm --filter docs build`.",
          )
          console.error("[cmd-k] pagefind load failed", e)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, api])

  useEffect(() => {
    if (!api || !query.trim()) {
      setHits([])
      return
    }
    let cancelled = false
    ;(async () => {
      const { results } = await api.search(query)
      const top = await Promise.all(results.slice(0, 8).map((r) => r.data()))
      if (cancelled) return
      setHits(
        top.map((d) => ({
          url: d.url,
          title: d.meta.title ?? d.url,
          excerpt: d.excerpt,
        })),
      )
    })()
    return () => {
      cancelled = true
    }
  }, [api, query])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-24 backdrop-blur"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search docs…"
          className="w-full border-b border-border bg-transparent px-4 py-3 text-sm focus:outline-none"
        />
        <ul className="max-h-80 divide-y divide-border overflow-y-auto text-sm">
          {loadError ? (
            <li className="px-4 py-3 text-muted-foreground">{loadError}</li>
          ) : hits.length === 0 ? (
            <li className="px-4 py-3 text-muted-foreground">
              {query.trim() ? "No results." : "Type to search. ⌘K toggles."}
            </li>
          ) : (
            hits.map((h) => (
              <li key={h.url}>
                <Link
                  href={h.url}
                  className="block px-4 py-3 hover:bg-muted"
                  onClick={() => setOpen(false)}
                >
                  <div className="font-medium">{h.title}</div>
                  <div
                    className="mt-1 line-clamp-2 text-xs text-muted-foreground"
                    dangerouslySetInnerHTML={{ __html: h.excerpt }}
                  />
                </Link>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
