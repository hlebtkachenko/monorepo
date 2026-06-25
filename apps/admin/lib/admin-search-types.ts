import "server-only"

/**
 * Pure-type module split out of `admin-search.ts` because that file is
 * marked `"use server"` — Next.js forbids non-async-function exports from
 * a `"use server"` module.
 */
export interface SearchResult {
  kind: "org" | "user" | "workspace" | "audit" | "tool"
  id: string
  label: string
  sublabel?: string
  href: string
}
