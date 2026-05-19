export { signSignupToken, verifySignupToken, type SignupClaims } from "./signup"
export {
  signLoginEmailToken,
  verifyLoginEmailToken,
  type LoginEmailClaims,
} from "./login-email"
export {
  signOnboardingStateToken,
  verifyOnboardingStateToken,
  type OnboardingStateClaims,
} from "./onboarding-state"
export {
  generateRawInviteToken,
  hashInviteToken,
  INVITE_TOKEN_BYTES,
  type InviteRecord,
} from "./invite"
export {
  generateRawApiKey,
  hashApiKey,
  API_KEY_TOKEN_BYTES,
  API_KEY_PREFIX,
  type GeneratedApiKey,
} from "./api-key"
export {
  signActiveWorkspaceToken,
  verifyActiveWorkspaceToken,
  type ActiveWorkspaceClaims,
} from "./active-workspace"
export { TokenError } from "./jwt"

// Unified opaque-token system (ADR-0022). See ./README.md.
export {
  AFKEY_REGEX,
  TOKEN_BODY_LENGTH,
  TOKEN_CHECKSUM_LENGTH,
  TOKEN_PREFIX,
  computeChecksum,
  formatToken,
  generateTokenBody,
  hashRawToken,
  parseToken,
  verifyChecksum,
} from "./format"
export {
  DEFAULT_TTL_SECONDS,
  consumeToken,
  expireDueAuthTokens,
  hashUserAgent,
  mintToken,
  pruneTerminalAuthTokens,
  resolveAuthTokenEnv,
  revokeToken,
  revokeTokenById,
  truncateIp,
  type ConsumedToken,
  type ConsumeOptions,
  type ForensicContext,
  type MintOptions,
  type MintedToken,
} from "./auth-token"
export {
  AUTH_COOKIE_DESCRIPTORS,
  clearAuthCookie,
  readAuthCookie,
  setAuthCookie,
  type AuthCookieDescriptor,
  type CookieStore,
  type SetAuthCookieOptions,
} from "./cookies"
export type {
  AuthTokenEnv,
  AuthTokenKind,
  AuthTokenStatus,
} from "@workspace/db/schema"
