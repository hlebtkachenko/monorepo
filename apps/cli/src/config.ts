import { mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

/**
 * On-disk config layout (TOML-ish; one key per line, no nested sections).
 * Path: `~/.config/afframe/config.toml`. Mode `0600` on write.
 *
 * Multi-profile is supported via prefix:
 *   default.api_key = "affk_test_..."
 *   default.api_base = "https://api.afframe.com"
 *   staging.api_key = "affk_test_..."
 *
 * AFFRAME_API_KEY / AFFRAME_API_BASE env vars override the active profile.
 * AFFRAME_PROFILE selects which profile to use (default: "default").
 */
export interface CliConfig {
  apiKey: string
  apiBase: string
  profile: string
}

export const CONFIG_DIR = join(homedir(), ".config", "afframe")
export const CONFIG_PATH = join(CONFIG_DIR, "config.toml")

const DEFAULT_BASE = "https://api.afframe.com"

interface FileShape {
  profiles: Record<string, { api_key?: string; api_base?: string }>
}

function readFile(): FileShape {
  try {
    const text = readFileSync(CONFIG_PATH, "utf8")
    const out: FileShape = { profiles: {} }
    for (const raw of text.split("\n")) {
      const line = raw.trim()
      if (!line || line.startsWith("#")) continue
      const eq = line.indexOf("=")
      if (eq === -1) continue
      const lhs = line.slice(0, eq).trim()
      const rhs = line
        .slice(eq + 1)
        .trim()
        .replace(/^"|"$/g, "")
      const dot = lhs.indexOf(".")
      if (dot === -1) continue
      const profile = lhs.slice(0, dot)
      const key = lhs.slice(dot + 1)
      out.profiles[profile] ??= {}
      const p = out.profiles[profile]
      if (key === "api_key") p.api_key = rhs
      else if (key === "api_base") p.api_base = rhs
    }
    return out
  } catch {
    return { profiles: {} }
  }
}

function writeFile(shape: FileShape): void {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true })
  const lines: string[] = []
  for (const [profile, fields] of Object.entries(shape.profiles)) {
    if (fields.api_key) lines.push(`${profile}.api_key = "${fields.api_key}"`)
    if (fields.api_base)
      lines.push(`${profile}.api_base = "${fields.api_base}"`)
  }
  writeFileSync(CONFIG_PATH, lines.join("\n") + "\n", { mode: 0o600 })
  chmodSync(CONFIG_PATH, 0o600)
}

/** Resolve the active config: env vars win, then file, then defaults. */
export function loadConfig(): CliConfig | undefined {
  const profile = process.env.AFFRAME_PROFILE ?? "default"
  const file = readFile()
  const fromFile = file.profiles[profile] ?? {}
  const apiKey = process.env.AFFRAME_API_KEY ?? fromFile.api_key
  const apiBase =
    process.env.AFFRAME_API_BASE ?? fromFile.api_base ?? DEFAULT_BASE
  if (!apiKey) return undefined
  return { apiKey, apiBase, profile }
}

/** Write a key (and optional base URL) into a named profile. */
export function saveProfile(
  profile: string,
  apiKey: string,
  apiBase?: string,
): void {
  const file = readFile()
  file.profiles[profile] = {
    api_key: apiKey,
    api_base: apiBase ?? file.profiles[profile]?.api_base,
  }
  writeFile(file)
}

/** Remove a profile from disk. No-op if it doesn't exist. */
export function clearProfile(profile: string): void {
  const file = readFile()
  delete file.profiles[profile]
  writeFile(file)
}
