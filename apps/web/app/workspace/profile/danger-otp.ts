import { createHmac, timingSafeEqual } from "node:crypto"

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/

export function createDangerOtpValue(
  secret: string,
  identifier: string,
  code: string,
): string {
  return `${hashDangerOtp(secret, identifier, code)}:0`
}

export function verifyDangerOtpValue(
  secret: string,
  identifier: string,
  code: string,
  storedValue: string,
): { matches: boolean; attempts: number; storedHash: string } {
  const [storedHash = "", attemptsRaw = "0"] = storedValue.split(":")
  const parsedAttempts = Number.parseInt(attemptsRaw, 10)
  const attempts = Number.isSafeInteger(parsedAttempts)
    ? Math.max(0, parsedAttempts)
    : 0
  const candidateHash = hashDangerOtp(secret, identifier, code)
  const matches =
    SHA256_HEX_PATTERN.test(storedHash) &&
    timingSafeEqual(
      Buffer.from(storedHash, "hex"),
      Buffer.from(candidateHash, "hex"),
    )

  return { matches, attempts, storedHash }
}

function hashDangerOtp(
  secret: string,
  identifier: string,
  code: string,
): string {
  return createHmac("sha256", secret)
    .update(identifier)
    .update(":")
    .update(code)
    .digest("hex")
}
