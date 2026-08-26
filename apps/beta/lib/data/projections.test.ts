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
  documentSummary,
  filingView,
  forbiddenClientKeys,
  membershipSummary,
  organizationCard,
  organizationSummary,
  ownerDocumentDetail,
  orgMemberSummary,
  reportingPeriodView,
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

describe("organizationCard", () => {
  it("carries the identity card of §2.1 item 5 and stops there", () => {
    const card = organizationCard(hostileOrganizationRow)

    expect(Object.keys(card).sort()).toEqual([
      "aresFetchedAt",
      "bankAccountNumber",
      "bankAccountPrefix",
      "bankCode",
      "bic",
      "courtFileNumber",
      "dataBoxId",
      "dic",
      "iban",
      "ico",
      "id",
      "isDemo",
      "legalName",
      "registeredCity",
      "registeredCountryCode",
      "registeredHouseNumber",
      "registeredOrientationNumber",
      "registeredPostalCode",
      "registeredStreet",
      "slug",
      "taxOfficeCode",
      "vatRegime",
      "vatRegisteredFrom",
    ])
    // Wider than `organizationSummary`, and still an explicit pick: the three
    // columns below are on the row and are not the client's business.
    expect(card).not.toHaveProperty("archivedAt")
    expect(card).not.toHaveProperty("contactEmail")
    expect(card).not.toHaveProperty("contactPhone")
    expect(forbiddenClientKeys(card)).toEqual([])
  })

  it("renders the ARES stamp as an ISO instant rather than a Date", () => {
    expect(organizationCard(hostileOrganizationRow).aresFetchedAt).toBe(
      now.toISOString(),
    )
    expect(
      organizationCard({ ...hostileOrganizationRow, ares_fetched_at: null })
        .aresFetchedAt,
    ).toBeNull()
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

describe("reportingPeriodView", () => {
  it("is an explicit pick, and ships no label", () => {
    const view = reportingPeriodView({
      id: "0199a0b1-0000-7000-8000-000000000003",
      period_kind: "quarter",
      year: 2026,
      month: null,
      quarter: 3,
      starts_on: "2026-07-01",
      ends_on: "2026-09-30",
      // Everything else `SELECT *` would hand you.
      organization_id: "0199a0b1-0000-7000-8000-000000000002",
      created_at: now,
    } as Parameters<typeof reportingPeriodView>[0])

    expect(Object.keys(view).sort()).toEqual([
      "endsOn",
      "id",
      "kind",
      "month",
      "quarter",
      "startsOn",
      "year",
    ])
    // A period renders as "Q3 2026" or "07/2026" or "2026" depending on kind,
    // and that formatting is i18n's job — a Czech string built here would be
    // untranslatable.
    expect(view).not.toHaveProperty("label")
    expect(view).not.toHaveProperty("organization_id")
    expect(view).not.toHaveProperty("created_at")
  })
})

describe("filingView", () => {
  /** Everything `SELECT *` on filing would hand you, internal note included. */
  const hostileFilingRow = {
    id: "0199a0b1-0000-7000-8000-000000000004",
    organization_id: "0199a0b1-0000-7000-8000-000000000002",
    kind: "dph_priznani" as const,
    period_id: "0199a0b1-0000-7000-8000-000000000003",
    due_on: "2026-04-27",
    status: "filed" as const,
    filed_on: "2026-04-25",
    amount_due: "31200.00",
    paid_at: new Date("2026-04-26T09:00:00Z"),
    variable_symbol: "12345678",
    document_id: "0199a0b1-0000-7000-8000-000000000005",
    note_client: "Zaplaťte prosím do 25.",
    note_internal: "Klient neposlal podklady, urgovat 20.",
    created_at: now,
    updated_at: new Date("2026-04-26T10:00:00Z"),
  }

  const period = reportingPeriodView({
    id: "0199a0b1-0000-7000-8000-000000000003",
    period_kind: "month",
    year: 2026,
    month: 3,
    quarter: null,
    starts_on: "2026-03-01",
    ends_on: "2026-03-31",
  } as Parameters<typeof reportingPeriodView>[0])

  it("keeps the client allowlist and drops the office's own note", () => {
    const view = filingView({
      ...hostileFilingRow,
      family: "dph",
      overdue: false,
      hasAttachment: true,
      attachmentDocumentId: hostileFilingRow.document_id,
      period,
    })

    expect(Object.keys(view).sort()).toEqual([
      "amountDue",
      "attachmentDocumentId",
      "dueOn",
      "family",
      "filedOn",
      "hasAttachment",
      "id",
      "kind",
      "noteClient",
      "overdue",
      "paidAt",
      "period",
      "status",
      "updatedAt",
      "variableSymbol",
    ])
    expect(forbiddenClientKeys(view)).toEqual([])
    expect(JSON.stringify(view)).not.toContain("urgovat")
    // The tenant id is absent: an id the reader cannot use is only useful for
    // guessing at others. `documentId` (the raw `filing.document_id` spelling)
    // is absent too — only the CALLER-VALIDATED `attachmentDocumentId` ships,
    // never the unfiltered column.
    expect(view).not.toHaveProperty("organizationId")
    expect(view).not.toHaveProperty("documentId")
    // The attachment is a boolean AND an id the CALLER resolved — both read
    // back off the same filtered join (`lib/data/filings.ts`'s
    // `visibleAttachment()`), so a hasAttachment:true row's id is exactly the
    // document this reader may open.
    expect(view.hasAttachment).toBe(true)
    expect(view.attachmentDocumentId).toBe(hostileFilingRow.document_id)
  })

  it("carries money as a string and instants as ISO", () => {
    const view = filingView({
      ...hostileFilingRow,
      family: "dph",
      overdue: true,
      hasAttachment: true,
      attachmentDocumentId: hostileFilingRow.document_id,
      period,
    })

    expect(view.amountDue).toBe("31200.00")
    expect(typeof view.amountDue).toBe("string")
    expect(view.paidAt).toBe("2026-04-26T09:00:00.000Z")
    expect(view.updatedAt).toBe("2026-04-26T10:00:00.000Z")
    expect(view.overdue).toBe(true)
  })

  it("keeps an unpaid, unstated filing null rather than zero — and never leaks an id the caller says is absent", () => {
    const view = filingView({
      ...hostileFilingRow,
      amount_due: null,
      paid_at: null,
      family: "dph",
      overdue: false,
      // The row still carries a raw `document_id` — the caller resolved it
      // against the document filters and got nothing (soft-deleted, hidden, or
      // purged), so it hands filingView `hasAttachment: false` and
      // `attachmentDocumentId: null` regardless of what the raw column says.
      hasAttachment: false,
      attachmentDocumentId: null,
      period,
    })

    // "The office has not stated an amount" is not "the amount is zero" (§0.4).
    expect(view.amountDue).toBeNull()
    expect(view.paidAt).toBeNull()
    expect(view.hasAttachment).toBe(false)
    expect(view.attachmentDocumentId).toBeNull()
    // The raw document id from the hostile row must not leak under any name
    // when the caller has already decided this reader may not have it.
    expect(JSON.stringify(view)).not.toContain(hostileFilingRow.document_id)
  })
})

/** Everything `SELECT *` on `document` would hand you (PR 14). */
const hostileDocumentRow = {
  id: "0199a0b1-0000-7000-8000-000000000003",
  organization_id: "0199a0b1-0000-7000-8000-000000000004",
  doc_type: "invoice_in" as const,
  status: "returned" as const,
  original_filename: "Faktura Nováková 03-2026.pdf",
  storage_key:
    "org/0199a0b1-0000-7000-8000-000000000004/0199a0b1-0000-7000-8000-000000000005.pdf",
  content_type: "application/pdf",
  extension: "pdf",
  byte_size: 12345,
  sha256: "a".repeat(64),
  preview_storage_key:
    "org/0199a0b1-0000-7000-8000-000000000004/0199a0b1-0000-7000-8000-000000000007.jpg",
  preview_byte_size: 4321,
  document_date: "2026-03-01",
  amount: "1234.56",
  site_ref: "Vinohrady",
  office_message: "Chybí druhá strana",
  internal_note: "Klient dluží ještě jeden doklad.",
  visible_to_client: true,
  payslip_employee_id: null,
  payslip_period_id: null,
  uploaded_by_user_id: "0199a0b1-0000-7000-8000-000000000006",
  deleted_at: null,
  created_at: now,
  updated_at: now,
}

describe("documentSummary — the CLIENT projection", () => {
  it("never carries the office-internal layer, whatever the row holds", () => {
    const summary = documentSummary(hostileDocumentRow)

    expect(Object.keys(summary).sort()).toEqual([
      "amount",
      "byteSize",
      "contentType",
      "docType",
      "documentDate",
      "filename",
      "hasPreview",
      "id",
      "officeMessage",
      "siteRef",
      "status",
      "uploadedAt",
    ])
    expect(summary).not.toHaveProperty("internal_note")
    expect(summary).not.toHaveProperty("internalNote")
    expect(summary).not.toHaveProperty("storage_key")
    expect(summary).not.toHaveProperty("sha256")
    expect(summary).not.toHaveProperty("visible_to_client")
    expect(forbiddenClientKeys(summary)).toEqual([])
  })

  /**
   * The derivative's key is a key like any other (PR 11). The projection turns
   * it into a yes/no, and the row it was read from is right there in the same
   * function — so this is the assertion that the boolean did not arrive with the
   * string still attached to it.
   */
  it("reduces the preview derivative to a boolean, never its key", () => {
    const summary = documentSummary(hostileDocumentRow)

    expect(summary.hasPreview).toBe(true)
    expect(summary).not.toHaveProperty("preview_storage_key")
    expect(summary).not.toHaveProperty("previewStorageKey")
    expect(summary).not.toHaveProperty("preview_byte_size")
    expect(JSON.stringify(summary)).not.toContain("org/")
    expect(
      forbiddenClientKeys({
        previewStorageKey: hostileDocumentRow.preview_storage_key,
      }),
    ).toEqual(["previewStorageKey"])
  })

  it("says no preview when the row carries none", () => {
    expect(
      documentSummary({ ...hostileDocumentRow, preview_storage_key: null })
        .hasPreview,
    ).toBe(false)
  })
})

describe("ownerDocumentDetail — the OWNER-ONLY projection (PR 14)", () => {
  it("exposes the office layer under renamed keys, and still passes the client fence", () => {
    const detail = ownerDocumentDetail(hostileDocumentRow)

    expect(detail.note).toBe(hostileDocumentRow.internal_note)
    expect(detail.clientVisible).toBe(hostileDocumentRow.visible_to_client)
    // Still a pick, not a spread: storage identity never leaves this layer
    // either — the owner sees the office's own notes, not S3's.
    expect(detail).not.toHaveProperty("storage_key")
    expect(detail).not.toHaveProperty("sha256")
    // The renamed keys are what let this projection carry data that WOULD
    // fail `forbiddenClientKeys` under the raw column names — see the type's
    // own header comment in `projections.ts`.
    expect(forbiddenClientKeys(detail)).toEqual([])
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
    expect(CLIENT_FORBIDDEN_COLUMNS).toContain("note_internal")
  })

  it("catches the office's own note under either spelling", () => {
    expect(forbiddenClientKeys({ note_internal: "urgovat" })).toEqual([
      "note_internal",
    ])
    expect(forbiddenClientKeys({ noteInternal: "urgovat" })).toEqual([
      "noteInternal",
    ])
    // The client-facing half of the same pair stays allowed.
    expect(forbiddenClientKeys({ noteClient: "Zaplaťte prosím" })).toEqual([])
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
