import type { BetaOrgRole, BetaSetupTokenPurpose } from "@/db/schema"
import type { BetaMessageKey } from "@/i18n/messages"
import type { SetupLinkStatus } from "@/lib/data/projections"

/**
 * Enum value → message key.
 *
 * The DISPLAY labels are the spec's, not the enum's (§2.6.1, §2.10): `owner`
 * shows as "Účetní", `member` as "Pracovník firmy (vedení)". That mapping is
 * load-bearing rather than cosmetic — the whole point of the recommendation is
 * that an office user picking a role from a list must not mis-assign one
 * because "member" sounded like the smaller of two options. The enum names stay
 * as they are in the database.
 *
 * `satisfies Record<...>` so adding a value to an enum is a compile error here
 * rather than a blank cell in a grid.
 */

export const ROLE_LABEL_KEY = {
  owner: "admin.roleOwner",
  admin: "admin.roleAdmin",
  member: "admin.roleMember",
  guest: "admin.roleGuest",
} as const satisfies Record<BetaOrgRole, BetaMessageKey>

export const PURPOSE_LABEL_KEY = {
  account_setup: "admin.purposeAccountSetup",
  org_invite: "admin.purposeOrgInvite",
  password_reset: "admin.purposePasswordReset",
} as const satisfies Record<BetaSetupTokenPurpose, BetaMessageKey>

export const LINK_STATUS_LABEL_KEY = {
  live: "admin.linkStatusLive",
  consumed: "admin.linkStatusConsumed",
  revoked: "admin.linkStatusRevoked",
  expired: "admin.linkStatusExpired",
} as const satisfies Record<SetupLinkStatus, BetaMessageKey>

/** The order roles are offered in, most privileged first. */
export const ROLE_OPTIONS: readonly BetaOrgRole[] = [
  "owner",
  "admin",
  "member",
  "guest",
]
