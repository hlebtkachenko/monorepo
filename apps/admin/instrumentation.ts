/**
 * Runs once at server-process boot, before any other module is loaded.
 * Dev-only: admin is a separate Next.js process and doesn't load
 * `apps/web/.env.local` automatically. Mirror the auth-relevant subset
 * into process.env so `@workspace/auth/tokens` (which snapshots
 * APP_TOKEN_SECRET at module load via an IIFE) sees the right value.
 */
export async function register() {
  if (process.env.NODE_ENV === "production") return
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  const { existsSync, readFileSync } = await import("node:fs")
  const { resolve } = await import("node:path")

  const path = resolve(process.cwd(), "..", "web", ".env.local")
  if (!existsSync(path)) return

  const raw = readFileSync(path, "utf8")
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/)
    if (!m) continue
    const [, key, value] = m
    if (key && value !== undefined && !process.env[key]) {
      process.env[key] = value.replace(/^"(.*)"$/, "$1")
    }
  }
}
