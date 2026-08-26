/**
 * The client projections: what a browser is allowed to be told.
 *
 * The pure cases feed each helper a HOSTILE row — a full table row carrying
 * every office-internal column — and assert the output is the allowlist and
 * nothing else. That is the failure this file exists to catch: a projection
 * written as `{ ...row, label }` passes every type check and every rendering
 * test, and ships `is_staff` to the browser.
 *
 * The last case is against a real database, because `peekSetupToken` feeds an
 * UNAUTHENTICATED page from a table that is otherwise entirely secrets.
 */
import postgres from "postgres"
import { afterAll, describe, expect, it } from "vitest"

import { sharedDatabaseUrl, unique } from "../../tests/scratch-db"

import {
  CLIENT_FORBIDDEN_COLUMNS,
  forbiddenClientKeys,
  membershipSummary,
  organizationSummary,
  orgMemberSummary,
  setupInviteView,
  viewerProfile,
} from "./projections"

process.env["BETTER_AUTH_SECRET"] ??= `beta-test-secret-${"x".repeat(40)}`
process.env["BETTER_AUTH_URL"] ??= "http://localhost:3200"

const { peekSetupToken, generateSetupToken, hashSetupToken } =
  await import("@/lib/auth/setup-token")

const sql = postgres(sharedDatabaseUrl(), { max: 2, onnotice: () => {} })

afterAll(async () => {
  await sql.end({ timeout: 5 })
})

const now = new Date()

/** Everything `SELECT *` on app_user would hand you. */
const hostileUserRow = {
  id: "0199a0b1-0000-7000-8000-000000000001",
  email: "jan@example.com",
  email_verified: true,
  name: "Jan Novák",
  image: null,
  is_staff: true,
  two_factor_enabled: true,
  locale: "cs",
  disabled_at: now,
  created_at: now,
  updated_at: now,
}

/** Everything `SELECT *` on organization would hand you. */
const hostileOrganizationRow = {
  id: "0199a0b1-0000-7000-8000-000000000002",
  slug: "testovaci-sro",
  legal_name: "Testovací s.r.o.",
  ico: "12345678",
  dic: "CZ12345678",
  vat_regime: "platce" as const,
  vat_registered_from: "2026-01-01",
  registered_street: "Náměstí Míru",
  registered_house_number: "1",
  registered_orientation_number: null,
  registered_city: "Praha",
  registered_postal_code: "12000",
  registered_country_code: "CZ",
  data_box_id: "abcdefg",
  court_file_number: "C 12345",
  tax_office_code: "001",
  bank_account_prefix: null,
  bank_account_number: "1234567890",
  bank_code: "0800",
  iban: null,
  bic: null,
  contact_email: "info@example.com",
  contact_phone: "+420123456789",
  is_demo: false,
  ares_fetched_at: now,
  archived_at: now,
  created_at: now,
  updated_at: now,
}

describe("viewerProfile", () => {
  it("keeps three fields and drops every privileged one", () => {
    const profile = viewerProfile(hostileUserRow)

    expect(profile).toEqual({
      userId: hostileUserRow.id,
      email: "jan@example.com",
      name: "Jan Novák",
    })
    expect(forbiddenClientKeys(profile)).toEqual([])
  })
})

describe("organizationSummary", () => {
  it("keeps the summary allowlist and drops the rest of the identity card", () => {
    const summary = organizationSummary(hostileOrganizationRow)

    expect(Object.keys(summary).sort()).toEqual([
      "id",
      "isDemo",
      "legalName",
      "slug",
      "vatRegime",
      "vatRegisteredFrom",
    ])
    // archived_at in particular: an archived book never resolves a scope, so a
    // page holding this object has no archived state to reason about.
    expect(summary).not.toHaveProperty("archived_at")
    expect(summary).not.toHaveProperty("archivedAt")
    expect(forbiddenClientKeys(summary)).toEqual([])
  })
})

describe("membershipSummary", () => {
  it("carries the summary allowlist plus the viewer's own role, nothing else", () => {
    const summary = membershipSummary({
      ...hostileOrganizationRow,
      role: "admin" as const,
    })

    expect(Object.keys(summary).sort()).toEqual([
      "id",
      "isDemo",
      "legalName",
      "role",
      "slug",
      "vatRegime",
      "vatRegisteredFrom",
    ])
    expect(summary.role).toBe("admin")
    expect(forbiddenClientKeys(summary)).toEqual([])
  })
})

describe("orgMemberSummary", () => {
  it("drops is_staff and disabled_at from the people list", () => {
    const row = {
      ...hostileUserRow,
      user_id: hostileUserRow.id,
      role: "admin" as const,
      active: true,
    }
    const member = orgMemberSummary(row)

    expect(member).toEqual({
      userId: hostileUserRow.id,
      name: "Jan Novák",
      email: "jan@example.com",
      role: "admin",
      active: true,
    })
    // A company admin reading their colleagues must not learn who is office
    // staff, nor read the office's deactivation timestamps.
    expect(forbiddenClientKeys(member)).toEqual([])
  })
})

describe("forbiddenClientKeys", () => {
  it("catches a forbidden column renamed to camelCase", () => {
    expect(forbiddenClientKeys({ isStaff: true })).toEqual(["isStaff"])
    expect(forbiddenClientKeys({ is_staff: true })).toEqual(["is_staff"])
    expect(forbiddenClientKeys({ disabledAt: null })).toEqual(["disabledAt"])
  })

  it("catches one nested inside a list of rows", () => {
    const payload = {
      members: [{ userId: "u", role: "guest" }, { tokenHash: "x" }],
    }
    expect(forbiddenClientKeys(payload)).toEqual(["tokenHash"])
  })

  it("passes a clean object", () => {
    expect(
      forbiddenClientKeys({ id: "1", legalName: "Testovací s.r.o." }),
    ).toEqual([])
  })

  it("lists both halves of the rule it enforces", () => {
    // A regression fence on the list itself: dropping an entry here silently
    // disarms every projection assertion in the suite.
    expect(CLIENT_FORBIDDEN_COLUMNS).toContain("is_staff")
    expect(CLIENT_FORBIDDEN_COLUMNS).toContain("disabled_at")
    expect(CLIENT_FORBIDDEN_COLUMNS).toContain("token_hash")
  })
})

describe("setupInviteView", () => {
  it("is an explicit pick", () => {
    const view = setupInviteView({
      purpose: "org_invite",
      email: "host@example.com",
      organizationName: "Testovací s.r.o.",
    })
    expect(Object.keys(view).sort()).toEqual([
      "email",
      "organizationName",
      "purpose",
    ])
  })

  it("hands an unauthenticated page three fields of a table full of secrets", async () => {
    const [staff] = await sql<{ id: string }[]>`
      INSERT INTO app_user (email, is_staff)
      VALUES (${`${unique("staff")}@example.com`}, true)
      RETURNING id
    `
    const [org] = await sql<{ id: string }[]>`
      INSERT INTO organization (slug, legal_name)
      VALUES (${unique("org-")}, 'Testovací s.r.o.')
      RETURNING id
    `
    const raw = generateSetupToken()
    await sql`
      INSERT INTO user_setup_token
        (purpose, token_hash, email, organization_id, granted_role,
         issued_by_user_id, issued_ip, expires_at)
      VALUES ('org_invite', ${hashSetupToken(raw)},
              ${`${unique("invited")}@example.com`}, ${org!.id}, 'guest',
              ${staff!.id}, '203.0.113.9', now() + interval '71 hours')
    `

    const view = await peekSetupToken(raw)

    expect(Object.keys(view!).sort()).toEqual([
      "email",
      "organizationName",
      "purpose",
    ])
    expect(view!.organizationName).toBe("Testovací s.r.o.")
    // Not the hash, not the issuer, not the IP, not the granted role.
    expect(forbiddenClientKeys(view)).toEqual([])
    expect(JSON.stringify(view)).not.toContain(hashSetupToken(raw))
    expect(JSON.stringify(view)).not.toContain("203.0.113.9")
  })
})
