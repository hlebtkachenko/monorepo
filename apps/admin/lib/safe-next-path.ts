/**
 * Single source of truth for "is this a safe local return URL?" Used by:
 *   - `step-up.ts` redirect to /auth/step-up?return=...
 *   - `/auth/step-up/page.tsx` reading the param back
 *   - `/auth/step-up/actions.ts` final redirect on success
 *
 * A net-new bypass discovered here is fixed once and covers all three.
 *
 * Rejects: empty / undefined, non-`/` start, protocol-relative `//`,
 * backslash-escape `/\`, scheme prefix `/scheme:`.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return "/"
  if (!raw.startsWith("/")) return "/"
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/"
  if (/^\/[A-Za-z][A-Za-z0-9+.-]*:/.test(raw)) return "/"
  return raw
}
