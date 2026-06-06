/**
 * Stable dedup fingerprint over (source + normalized parts). Uses Web Crypto SHA-256
 * (native in Workers and Node 20+). MUST be deterministic — callers strip volatile
 * tokens (timestamps, uuids, line:col) from `parts` before calling, or dedup breaks.
 */
export async function fingerprint(
  source: string,
  parts: string[],
): Promise<string> {
  const norm = parts
    .map((p) => p.trim().toLowerCase().replace(/\s+/g, " "))
    .join("|")
  const data = new TextEncoder().encode(`${source}::${norm}`)
  const buf = await crypto.subtle.digest("SHA-256", data)
  return [...new Uint8Array(buf)]
    .slice(0, 12)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}
