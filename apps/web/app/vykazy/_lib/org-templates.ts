// Saved identification blocks for the Výkazy builder.
//
// The IČO + "Načíst z ARES" pair already fills název, sídlo, PSČ, obec, právní
// forma and předmět podnikání. What ARES cannot know is the rest of the block —
// rok, měsíc, rozvahový den, sestaveno/schváleno dne, the tisíce toggle — and
// that is what gets retyped for every client, every period. A template stores
// the whole OrgConfig under a name and puts it back in one pick.
//
// Templates live in localStorage, per browser, never in the repo: these are real
// účetní jednotky, and this is a public repository.

import { coerceOrg } from "./storage"
import type { OrgConfig } from "./types"

const STORAGE_KEY = "vykazy-org-templates"

export interface OrgTemplate {
  /** Display name; also the identity, so re-saving the same firm overwrites. */
  name: string
  org: OrgConfig
}

/** Normalize whatever is in storage into templates, dropping anything unusable. */
export function coerceTemplates(input: unknown): OrgTemplate[] {
  if (!Array.isArray(input)) return []
  const out: OrgTemplate[] = []
  for (const entry of input) {
    if (typeof entry !== "object" || entry === null) continue
    const name = (entry as { name?: unknown }).name
    if (typeof name !== "string" || name.trim() === "") continue
    out.push({
      name: name.trim(),
      org: coerceOrg((entry as { org?: unknown }).org),
    })
  }
  return out
}

/**
 * Insert or replace a template, keeping the list sorted by name.
 *
 * Name is the identity: saving the same účetní jednotka again updates its
 * template rather than growing a second one that silently diverges.
 */
export function upsertTemplate(
  templates: OrgTemplate[],
  next: OrgTemplate,
): OrgTemplate[] {
  const name = next.name.trim()
  const rest = templates.filter((t) => t.name !== name)
  return [...rest, { ...next, name }].sort((a, b) =>
    a.name.localeCompare(b.name, "cs"),
  )
}

export function loadTemplates(): OrgTemplate[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? coerceTemplates(JSON.parse(raw)) : []
  } catch {
    return []
  }
}

export function saveTemplates(templates: OrgTemplate[]): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
  } catch {
    // storage full / unavailable (private mode) — non-fatal.
  }
}
