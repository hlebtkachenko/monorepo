"use client"

/**
 * Per-user localStorage helpers for the admin command palette.
 *
 * Keys are namespaced by `userId` so power-user habits do not leak across
 * shared dev machines (see `.context/admin/07-cmdk-research.md` §E.4).
 *
 * Every read is wrapped in try/catch; a corrupted JSON blob silently resets
 * to the default rather than throwing inside a render.
 */

export type StickyScope = "all" | "commands" | "pages" | "live"

const SCOPE_KEY_PREFIX = "admin.cmdk.scope."
const RECENTS_KEY_PREFIX = "admin.cmdk.recents."
const LEGACY_RECENTS_KEY = "admin.cmdk.recents"

const VALID_SCOPES: ReadonlySet<StickyScope> = new Set([
  "all",
  "commands",
  "pages",
  "live",
])

export interface CmdkRecent {
  label: string
  href: string
  at: number
}

const RECENTS_MAX = 5

function scopeKey(userId: string): string {
  return SCOPE_KEY_PREFIX + userId
}

function recentsKey(userId: string): string {
  return RECENTS_KEY_PREFIX + userId
}

export function getStickyScope(userId: string): StickyScope {
  if (typeof window === "undefined") return "all"
  try {
    const raw = window.localStorage.getItem(scopeKey(userId))
    if (!raw) return "all"
    return VALID_SCOPES.has(raw as StickyScope) ? (raw as StickyScope) : "all"
  } catch {
    return "all"
  }
}

export function setStickyScope(userId: string, scope: StickyScope): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(scopeKey(userId), scope)
  } catch {
    // ignore quota / disabled storage
  }
}

/**
 * Read per-user recents. One-shot migration: if the legacy global
 * `admin.cmdk.recents` key exists and the per-user key is empty, copy the
 * legacy value into the per-user key and then delete the legacy key.
 */
export function readRecents(userId: string): CmdkRecent[] {
  if (typeof window === "undefined") return []
  try {
    const key = recentsKey(userId)
    const raw = window.localStorage.getItem(key)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as CmdkRecent[]) : []
    }
    // Legacy migration
    const legacy = window.localStorage.getItem(LEGACY_RECENTS_KEY)
    if (legacy) {
      try {
        window.localStorage.setItem(key, legacy)
      } catch {
        // ignore
      }
      try {
        window.localStorage.removeItem(LEGACY_RECENTS_KEY)
      } catch {
        // ignore
      }
      const parsed: unknown = JSON.parse(legacy)
      return Array.isArray(parsed) ? (parsed as CmdkRecent[]) : []
    }
    return []
  } catch {
    return []
  }
}

export function pushRecent(userId: string, recent: CmdkRecent): void {
  if (typeof window === "undefined") return
  try {
    const next = [
      recent,
      ...readRecents(userId).filter((x) => x.href !== recent.href),
    ].slice(0, RECENTS_MAX)
    window.localStorage.setItem(recentsKey(userId), JSON.stringify(next))
  } catch {
    // ignore quota / disabled storage
  }
}
