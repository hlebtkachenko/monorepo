import { SignJWT, jwtVerify, errors } from "jose"

/**
 * Shared HMAC sign/verify for app-issued tokens (signup, invite, etc.).
 *
 * All tokens are HS256 JWTs signed with `APP_TOKEN_SECRET` (a 32+ byte
 * shared secret). The token is opaque to clients; never include sensitive
 * data in claims beyond what's strictly needed to scope the action.
 *
 * Each token kind carries a `kind` claim (e.g. "signup", "invite") so
 * verifiers can refuse a token issued for a different flow even if the
 * shape matches.
 */

const ISSUER = "app"
const MIN_SECRET_BYTES = 32
const CLOCK_TOLERANCE_SECONDS = 30

let cachedSecret: Uint8Array | null = null
let cachedSecretSource: string | undefined

function requireSecret(): Uint8Array {
  const raw = process.env.APP_TOKEN_SECRET
  if (!raw) {
    throw new Error(
      "APP_TOKEN_SECRET is not set. Token signing/verification is disabled.",
    )
  }
  // Reset cache if env changes between calls (test reset, secret rotation).
  if (cachedSecretSource !== raw) {
    const encoded = new TextEncoder().encode(raw)
    if (encoded.byteLength < MIN_SECRET_BYTES) {
      throw new Error(
        `APP_TOKEN_SECRET must be at least ${MIN_SECRET_BYTES} bytes (got ${encoded.byteLength}).`,
      )
    }
    cachedSecret = encoded
    cachedSecretSource = raw
  }
  if (!cachedSecret) {
    throw new Error("APP_TOKEN_SECRET cache invariant violated.")
  }
  return cachedSecret
}

export interface BaseClaims {
  kind: string
}

export async function signToken<TClaims extends BaseClaims>(
  claims: TClaims,
  ttlSeconds: number,
): Promise<string> {
  return await new SignJWT({ ...(claims as Record<string, unknown>) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(claims.kind)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(requireSecret())
}

export class TokenError extends Error {
  constructor(
    message: string,
    public readonly code: "INVALID" | "EXPIRED" | "WRONG_KIND",
  ) {
    super(message)
    this.name = "TokenError"
  }
}

export async function verifyToken<TClaims extends BaseClaims>(
  token: string,
  expectedKind: TClaims["kind"],
): Promise<TClaims> {
  try {
    const { payload } = await jwtVerify(token, requireSecret(), {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: expectedKind,
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
    })
    if (payload.kind !== expectedKind) {
      throw new TokenError(
        `Expected token kind "${expectedKind}", got "${String(payload.kind)}"`,
        "WRONG_KIND",
      )
    }
    return payload as unknown as TClaims
  } catch (err) {
    if (err instanceof TokenError) {
      throw err
    }
    if (err instanceof errors.JWTExpired) {
      throw new TokenError("Token expired", "EXPIRED")
    }
    // Treat every other jose error as a generic invalid token. Specific
    // jose error messages may leak useful information to attackers.
    throw new TokenError("Invalid token", "INVALID")
  }
}
