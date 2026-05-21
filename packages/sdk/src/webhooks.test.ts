import { describe, expect, it } from "vitest"
import { verifyWebhook, WebhookVerificationError } from "./webhooks"

/**
 * Standard Webhooks v1 signature verifier — security-critical primitive.
 * Tests cover the published threat model:
 *
 *   1. Happy path — correct id + timestamp + signature passes silently.
 *   2. Stale timestamp — replay outside the tolerance window rejects.
 *   3. Invalid signature — bytes that don't HMAC to expected rejects.
 *   4. Missing header — any of id / timestamp / signature absent rejects.
 *   5. Multi-signature header — a header carrying many v1,... entries
 *      passes if any entry matches (key rotation case).
 *   6. Body mutation — same id + timestamp + key but different payload bytes
 *      fail (the whole point of signing).
 */

// Valid Standard Webhooks v1 secret: `whsec_` + base64 of 32 raw key bytes.
// Decoded key is the ASCII string "afframe-webhook-test-key-32bytes".
const SECRET = "whsec_YWZmcmFtZS13ZWJob29rLXRlc3Qta2V5LTMyYnl0ZXM="
const ID = "msg_2ZdAk5x"
const NOW_SEC = 1_700_000_000
const TIMESTAMP = String(NOW_SEC)
const PAYLOAD = JSON.stringify({ id: "evt_1", type: "ping" })

async function expectedSignature(
  secret: string,
  message: string,
): Promise<string> {
  // Mirrors `decodeSecret` in webhooks.ts: strip prefix, base64-decode to
  // recover raw HMAC key bytes per Standard Webhooks v1.
  const b64 = secret.slice("whsec_".length)
  const bin = atob(b64)
  const keyBytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) keyBytes[i] = bin.charCodeAt(i)
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const buf = await crypto.subtle.sign("HMAC", key, enc.encode(message))
  const bytes = new Uint8Array(buf)
  let mac = ""
  for (const b of bytes) mac += String.fromCharCode(b)
  return `v1,${btoa(mac)}`
}

const now = () => NOW_SEC * 1000

describe("verifyWebhook (Standard Webhooks v1)", () => {
  it("accepts a correctly-signed payload", async () => {
    const sig = await expectedSignature(SECRET, `${ID}.${TIMESTAMP}.${PAYLOAD}`)
    await expect(
      verifyWebhook({
        payload: PAYLOAD,
        headers: {
          "webhook-id": ID,
          "webhook-timestamp": TIMESTAMP,
          "webhook-signature": sig,
        },
        secret: SECRET,
        now,
      }),
    ).resolves.toBeUndefined()
  })

  it("rejects when timestamp drifts beyond the tolerance window", async () => {
    const sig = await expectedSignature(SECRET, `${ID}.${TIMESTAMP}.${PAYLOAD}`)
    await expect(
      verifyWebhook({
        payload: PAYLOAD,
        headers: {
          "webhook-id": ID,
          "webhook-timestamp": TIMESTAMP,
          "webhook-signature": sig,
        },
        secret: SECRET,
        toleranceSec: 10,
        now: () => (NOW_SEC + 3600) * 1000,
      }),
    ).rejects.toMatchObject({
      name: "WebhookVerificationError",
      code: "stale_timestamp",
    })
  })

  it("rejects when no signature in the header matches", async () => {
    await expect(
      verifyWebhook({
        payload: PAYLOAD,
        headers: {
          "webhook-id": ID,
          "webhook-timestamp": TIMESTAMP,
          "webhook-signature": "v1,Zm9yZ2VkLXNpZ25hdHVyZQ==",
        },
        secret: SECRET,
        now,
      }),
    ).rejects.toMatchObject({
      name: "WebhookVerificationError",
      code: "invalid_signature",
    })
  })

  it("rejects when a required header is missing", async () => {
    for (const drop of [
      "webhook-id",
      "webhook-timestamp",
      "webhook-signature",
    ] as const) {
      const headers = {
        "webhook-id": ID,
        "webhook-timestamp": TIMESTAMP,
        "webhook-signature": "v1,XXXX",
      }
      headers[drop] = ""
      await expect(
        verifyWebhook({ payload: PAYLOAD, headers, secret: SECRET, now }),
      ).rejects.toMatchObject({
        name: "WebhookVerificationError",
        code: "missing_header",
      })
    }
  })

  it("accepts when one of several v1,... entries matches (rotation)", async () => {
    const real = await expectedSignature(
      SECRET,
      `${ID}.${TIMESTAMP}.${PAYLOAD}`,
    )
    const multi = `v1,YWFhYWFhYWFhYWFhYWFhYQ== ${real} v1,Ymxhbmstc2lnbmF0dXJl`
    await expect(
      verifyWebhook({
        payload: PAYLOAD,
        headers: {
          "webhook-id": ID,
          "webhook-timestamp": TIMESTAMP,
          "webhook-signature": multi,
        },
        secret: SECRET,
        now,
      }),
    ).resolves.toBeUndefined()
  })

  it("rejects when the payload bytes differ from what was signed", async () => {
    const sig = await expectedSignature(SECRET, `${ID}.${TIMESTAMP}.${PAYLOAD}`)
    await expect(
      verifyWebhook({
        payload: PAYLOAD + " ",
        headers: {
          "webhook-id": ID,
          "webhook-timestamp": TIMESTAMP,
          "webhook-signature": sig,
        },
        secret: SECRET,
        now,
      }),
    ).rejects.toBeInstanceOf(WebhookVerificationError)
  })

  it("rejects a secret missing the whsec_ prefix", async () => {
    await expect(
      verifyWebhook({
        payload: PAYLOAD,
        headers: {
          "webhook-id": ID,
          "webhook-timestamp": TIMESTAMP,
          "webhook-signature": "v1,XXXX",
        },
        secret: "raw-secret-without-prefix",
        now,
      }),
    ).rejects.toMatchObject({
      name: "WebhookVerificationError",
      code: "invalid_secret",
    })
  })

  it("rejects a secret whose payload is not valid base64", async () => {
    await expect(
      verifyWebhook({
        payload: PAYLOAD,
        headers: {
          "webhook-id": ID,
          "webhook-timestamp": TIMESTAMP,
          "webhook-signature": "v1,XXXX",
        },
        secret: "whsec_not_base64!!!",
        now,
      }),
    ).rejects.toMatchObject({
      name: "WebhookVerificationError",
      code: "invalid_secret",
    })
  })

  it("rejects a non-numeric timestamp before any signature work", async () => {
    await expect(
      verifyWebhook({
        payload: PAYLOAD,
        headers: {
          "webhook-id": ID,
          "webhook-timestamp": "not-a-number",
          "webhook-signature": "v1,XXXX",
        },
        secret: SECRET,
        now,
      }),
    ).rejects.toMatchObject({
      name: "WebhookVerificationError",
      code: "invalid_timestamp",
    })
  })
})
