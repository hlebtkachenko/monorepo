/** Constant-time string equality; no early-exit timing leak. Runtime-agnostic (no node deps). */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/** Authorize a POST /ingest call: `Authorization: Bearer <INGEST_SECRET>`. */
export function isAuthorizedIngest(
  authHeader: string | undefined,
  secret: string,
): boolean {
  if (!authHeader) return false
  const token = authHeader.replace(/^Bearer\s+/i, "")
  return constantTimeEqual(token, secret)
}

/** Verify the Telegram webhook secret-token header. */
export function isValidWebhookSecret(
  header: string | undefined,
  secret: string,
): boolean {
  if (!header) return false
  return constantTimeEqual(header, secret)
}

/** Only the allowlisted Telegram user may drive the bot. */
export function isAllowedUser(
  fromId: number | undefined,
  allowedId: number,
): boolean {
  return (
    typeof fromId === "number" &&
    Number.isFinite(allowedId) &&
    fromId === allowedId
  )
}
