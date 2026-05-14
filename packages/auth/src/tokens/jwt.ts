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
const secret = (() => {
  const raw = process.env.APP_TOKEN_SECRET
  if (!raw) {
    return null
  }
  if (raw.length < 32) {
    throw new Error(
      "APP_TOKEN_SECRET must be at least 32 bytes (got " + raw.length + ").",
    )
  }
  return new TextEncoder().encode(raw)
})()

function requireSecret(): Uint8Array {
  if (!secret) {
    throw new Error(
      "APP_TOKEN_SECRET is not set. Token signing/verification is disabled.",
    )
  }
  return secret
}

const ISSUER = "app"

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
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(requireSecret())
}

export class TokenError extends Error {
  constructor(
    message: string,
    public readonly code: "INVALID" | "EXPIRED" | "WRONG_KIND" | "DISABLED",
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
      issuer: ISSUER,
      audience: expectedKind,
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
    if (
      err instanceof errors.JWTInvalid ||
      err instanceof errors.JWTClaimValidationFailed ||
      err instanceof errors.JWSSignatureVerificationFailed
    ) {
      throw new TokenError("Invalid token", "INVALID")
    }
    throw new TokenError(
      (err as Error).message ?? "Unknown token error",
      "INVALID",
    )
  }
}
