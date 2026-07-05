// Pure map + helpers — safe to import from client (sidebar filter, cmdk).
// All side-effects (audit, DB reads, redirects) live in `require-section.ts`,
// which IS server-only.

import { STAFF_ROLES, type StaffRole } from "@workspace/db/schema"

/** Every staff role — universal-access rows in `SECTION_ACCESS`. */
const EVERY_ROLE: ReadonlyArray<StaffRole> = STAFF_ROLES

/**
 * Section access map. Keys are path prefixes inside the (gated) admin shell.
 * Values list every role that may enter that section. Longest-prefix wins.
 *
 * Defaults (no map hit) = owner only — fail closed. Every section reachable
 * to a non-owner MUST appear in this map.
 *
 * `guest` only gets the universal-access rows (Home, /profile, /changelog).
 * Every other section requires a real staff role.
 */
export const SECTION_ACCESS: Record<string, ReadonlyArray<StaffRole>> = {
  // Universal — everyone (incl. guest)
  "/": EVERY_ROLE,
  "/profile": EVERY_ROLE,
  "/changelog": EVERY_ROLE,

  // Customers
  "/orgs": ["owner", "admin", "support", "security"],
  "/workspaces": ["owner", "admin", "support", "security"],
  "/users": ["owner", "admin", "support", "security"],
  "/compliance": ["owner", "admin", "security"],
  "/invites": ["owner", "admin", "support"],

  // Ops / Platform / Staff
  "/ops": ["owner", "admin"],
  "/platform": ["owner", "admin", "developer", "security"],
  "/staff": ["owner", "admin", "security"],

  // Design system / docs (engineering + design)
  "/showcase": ["owner", "admin", "developer", "designer"],
  "/storybook": ["owner", "admin", "developer", "designer"],
  "/typography": ["owner", "admin", "developer", "designer"],

  // Narrowed sub-sections (owner only — nuclear surfaces)
  "/ops/sql": ["owner"],
  "/ops/kill-switches": ["owner"],
  "/ops/maintenance": ["owner"],
  "/ops/critical-systems": ["owner", "admin", "security"],
  "/ops/debug": ["owner", "admin", "developer"],
  "/staff/roles": ["owner"],
}

// Pre-sorted longest-first so `lookupSectionAccess` doesn't re-sort per call.
const SECTION_KEYS_LONGEST_FIRST: ReadonlyArray<string> = Object.keys(
  SECTION_ACCESS,
).sort((a, b) => b.length - a.length)

/**
 * Step-up sensitivity. Pages or named server-action keys here require a
 * recent re-auth cookie before they run, even for users whose role grants
 * the underlying capability. `"twofa"` implies `"password"` is also fresh.
 */
export type StepUpLevel = "password" | "twofa"

/**
 * Action keys that map to a step-up level. Typed union so call sites that
 * misspell a key fail at compile time instead of silently no-op'ing.
 * Every entry MUST have a live call site somewhere in the admin app.
 */
export type StepUpActionKey =
  | "impersonation.start"
  | "flag.kill_switch"
  | "invites.signup_token"
  | "api_key.create"

export const STEP_UP: Record<string, StepUpLevel> = {
  // Page paths
  "/ops/sql": "twofa",
  "/staff/roles": "twofa",
  "/ops/kill-switches": "twofa",
  "/ops/maintenance": "password",

  // Named action keys (see `StepUpActionKey`)
  "impersonation.start": "password",
  "flag.kill_switch": "twofa",
  "invites.signup_token": "password",
  // Minting a live `agent`-actor Brain key is a write-capable credential — a
  // fresh re-auth is required at action entry, like the signup-token mint.
  "api_key.create": "password",
}

/**
 * Flag key prefixes that promote a regular toggle into a "kill switch" —
 * sensitive enough that admins must step up with TOTP before flipping.
 * Match is case-sensitive and prefix-based; e.g. `maintenance.lockdown`
 * or `auth.disable_login` both qualify.
 */
export const KILL_SWITCH_FLAG_PREFIXES: ReadonlyArray<string> = [
  "maintenance.",
  "kill_switch.",
  "auth.disable_",
  "emergency.",
]

export function isKillSwitchFlag(key: string): boolean {
  return KILL_SWITCH_FLAG_PREFIXES.some((p) => key.startsWith(p))
}

/**
 * Longest-prefix lookup. Returns the role list that governs `path`, or
 * undefined when no entry covers it.
 *
 * The `/` entry matches ONLY `path === "/"` — never a fallback for
 * arbitrary unmapped paths. Unmapped paths must fail closed for every
 * non-owner role; owner gets an escape hatch in `canAccessSection`.
 */
export function lookupSectionAccess(
  path: string,
): ReadonlyArray<StaffRole> | undefined {
  for (const key of SECTION_KEYS_LONGEST_FIRST) {
    if (
      key === "/" ? path === "/" : path === key || path.startsWith(key + "/")
    ) {
      return SECTION_ACCESS[key]
    }
  }
  return undefined
}

export function lookupStepUp(key: string): StepUpLevel | undefined {
  return STEP_UP[key]
}

/**
 * Does `role` have access to `path`? Owner always allowed (escape hatch
 * for new routes that haven't been mapped yet). Everyone else must appear
 * in the map's role list. Unmapped path + non-owner = deny.
 */
export function canAccessSection(role: StaffRole, path: string): boolean {
  if (role === "owner") return true
  const list = lookupSectionAccess(path)
  if (!list) return false
  return list.includes(role)
}
