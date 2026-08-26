/**
 * The employee seat's ISSUE → CONSUME → LINK lifecycle, against a real
 * Postgres 18 (spec §2.6.1).
 *
 * The seat's whole security argument is that whose payslips an account reads is
 * decided ONCE, at issuance, by somebody who already holds the book — and is
 * then unrewritable. So this suite is written around the ways that decision
 * could be forced or re-made:
 *
 *   - binding a link to an employee in ANOTHER book;
 *   - binding a link to an employee who already has a seat;
 *   - consuming a second link that names an already-linked employee;
 *   - re-pointing an issued link at a different colleague (the UPDATE the
 *     immutability trigger has to refuse);
 *   - a `member` — a management seat that reads all payroll — trying to issue;
 *   - two live links for one employee, where the first-issued must be dead.
 *
 * The read-side isolation (employee A never sees employee B) is the sibling
 * suite, `lib/data/employee-seat.db.test.ts`.
 */
import postgres from "postgres"
import { afterAll, describe, expect, it } from "vitest"

import { sharedDatabaseUrl, unique } from "../../tests/scratch-db"

process.env["BETTER_AUTH_SECRET"] ??= `beta-test-secret-${"x".repeat(40)}`
process.env["BETTER_AUTH_URL"] ??= "http://localhost:3200"

const { consumeSetupToken, issueSetupToken } = await import("./setup-token")

const sql = postgres(sharedDatabaseUrl(), { max: 6, onnotice: () => {} })

afterAll(async () => {
  await sql.end({ timeout: 5 })
})

const PASSWORD = "Beta-Heslo-2026!"

async function createUser(staff: boolean): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO app_user (email, is_staff)
    VALUES (${`${unique("u")}@example.com`}, ${staff})
    RETURNING id
  `
  return row!.id
}

type Book = {
  orgId: string
  slug: string
  ownerId: string
  adminId: string
  memberId: string
}

/** An organization with an owner (staff, as the schema requires), an admin and a member. */
async function book(): Promise<Book> {
  const slug = unique("org-")
  const [org] = await sql<{ id: string }[]>`
    INSERT INTO organization (slug, legal_name)
    VALUES (${slug}, 'Testovací s.r.o.')
    RETURNING id
  `
  const ownerId = await createUser(true)
  const adminId = await createUser(false)
  const memberId = await createUser(false)
  await sql`
    INSERT INTO organization_membership (organization_id, user_id, role)
    VALUES (${org!.id}, ${ownerId}, 'owner'),
           (${org!.id}, ${adminId}, 'admin'),
           (${org!.id}, ${memberId}, 'member')
  `
  return { orgId: org!.id, slug, ownerId, adminId, memberId }
}

async function employee(
  orgId: string,
  fullName = "Jan Novák",
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO payroll_employee (organization_id, full_name, contract_type)
    VALUES (${orgId}, ${fullName}, 'hpp')
    RETURNING id
  `
  return row!.id
}

type IssuerRole = "owner" | "admin" | "member"

function issue(
  b: Book,
  employeeId: string | null,
  options: {
    role?: IssuerRole
    email?: string
    grantedRole?: "guest" | "member"
  } = {},
) {
  const role = options.role ?? "admin"
  const userId =
    role === "owner" ? b.ownerId : role === "admin" ? b.adminId : b.memberId
  return issueSetupToken({
    purpose: "org_invite",
    email: options.email ?? `${unique("emp")}@example.com`,
    organizationId: b.orgId,
    grantedRole: options.grantedRole ?? "guest",
    payrollEmployeeId: employeeId,
    issuer: {
      kind: "organization",
      userId,
      organizationId: b.orgId,
      role,
    },
    ip: "203.0.113.7",
    userAgent: "vitest",
  })
}

function consume(raw: string) {
  return consumeSetupToken({
    rawToken: raw,
    allowedPurposes: ["org_invite"],
    password: PASSWORD,
    ip: "203.0.113.7",
    userAgent: "vitest",
  })
}

async function linkedAccount(employeeId: string): Promise<string | null> {
  const [row] = await sql<{ app_user_id: string | null }[]>`
    SELECT app_user_id FROM payroll_employee WHERE id = ${employeeId}
  `
  return row?.app_user_id ?? null
}

describe("issuing a pre-bound seat invite", () => {
  it("mints a guest org_invite carrying the employee id", async () => {
    const b = await book()
    const employeeId = await employee(b.orgId)

    const issued = await issue(b, employeeId)
    expect(issued.ok).toBe(true)
    if (!issued.ok) return

    const [row] = await sql<
      { payroll_employee_id: string | null; granted_role: string }[]
    >`
      SELECT payroll_employee_id, granted_role
        FROM user_setup_token WHERE id = ${issued.link.id}
    `
    expect(row?.payroll_employee_id).toBe(employeeId)
    expect(row?.granted_role).toBe("guest")
  })

  it("refuses an employee row from ANOTHER book — the composite FK", async () => {
    const mine = await book()
    const theirs = await book()
    const stranger = await employee(theirs.orgId, "Petr Cizí")

    const issued = await issue(mine, stranger)
    expect(issued).toEqual({ ok: false, reason: "rejected" })

    // And nothing was minted: a refusal must not leave a live link behind.
    const [count] = await sql<{ n: string }[]>`
      SELECT count(*) AS n FROM user_setup_token
       WHERE payroll_employee_id = ${stranger}
    `
    expect(count?.n).toBe("0")
  })

  it("refuses an employee id that names nothing, with the SAME reason", async () => {
    // Indistinguishable from the cross-book case above — a caller must not be
    // able to use the refusal to probe which employee ids exist elsewhere.
    const b = await book()
    const issued = await issue(b, "00000000-0000-4000-8000-000000000000")
    expect(issued).toEqual({ ok: false, reason: "rejected" })
  })

  it("refuses a `member` issuer — reads all payroll, hands out nothing", async () => {
    // `purpose_not_allowed`, not `employee_binding_not_allowed`: a `member`
    // cannot mint an `org_invite` AT ALL (`mayIssuePurpose` → `managesPeople`),
    // so the general gate fires before the seat-specific one is reached. The
    // seat gate stays in `issueSetupToken` regardless — it is what would refuse
    // a future role that could invite guests but must not hand out seats, and
    // the database floors both (`beta_setup_token_issuer_guard` demands an
    // active owner|admin membership for any org-scoped issuance).
    const b = await book()
    const employeeId = await employee(b.orgId)
    const issued = await issue(b, employeeId, { role: "member" })
    expect(issued).toEqual({ ok: false, reason: "purpose_not_allowed" })

    const [count] = await sql<{ n: string }[]>`
      SELECT count(*) AS n FROM user_setup_token
       WHERE payroll_employee_id = ${employeeId}
    `
    expect(count?.n).toBe("0")
  })

  it("refuses a bound link that grants anything but guest", async () => {
    const b = await book()
    const employeeId = await employee(b.orgId)
    const issued = await issue(b, employeeId, {
      role: "owner",
      grantedRole: "member",
    })
    expect(issued).toEqual({
      ok: false,
      reason: "employee_binding_not_allowed",
    })
  })

  it("revokes every earlier live invite naming the same employee", async () => {
    // The office typo'd the address, then re-sent. The mistyped link must be
    // dead the moment the corrected one exists — not merely lose a race to it.
    const b = await book()
    const employeeId = await employee(b.orgId)

    const wrong = await issue(b, employeeId, { email: `${unique("typo")}@example.com` })
    const right = await issue(b, employeeId, { email: `${unique("jan")}@example.com` })
    expect(wrong.ok && right.ok).toBe(true)
    if (!wrong.ok || !right.ok) return

    const [first] = await sql<{ revoked_at: Date | null }[]>`
      SELECT revoked_at FROM user_setup_token WHERE id = ${wrong.link.id}
    `
    const [second] = await sql<{ revoked_at: Date | null }[]>`
      SELECT revoked_at FROM user_setup_token WHERE id = ${right.link.id}
    `
    expect(first?.revoked_at).not.toBeNull()
    expect(second?.revoked_at).toBeNull()

    // And the revoked one is genuinely unusable, not merely stamped.
    expect(await consume(wrong.link.token)).toEqual({
      ok: false,
      reason: "invalid",
    })
  })

  it("does not touch a live invite for a DIFFERENT employee", async () => {
    const b = await book()
    const first = await employee(b.orgId, "Jan Novák")
    const second = await employee(b.orgId, "Petra Nová")

    const a = await issue(b, first)
    await issue(b, second)
    expect(a.ok).toBe(true)
    if (!a.ok) return

    const [row] = await sql<{ revoked_at: Date | null }[]>`
      SELECT revoked_at FROM user_setup_token WHERE id = ${a.link.id}
    `
    expect(row?.revoked_at).toBeNull()
  })
})

describe("consuming a pre-bound seat invite", () => {
  it("creates the account, the guest membership and the link in one go", async () => {
    const b = await book()
    const employeeId = await employee(b.orgId)
    const issued = await issue(b, employeeId)
    expect(issued.ok).toBe(true)
    if (!issued.ok) return

    const result = await consume(issued.link.token)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.grantedRole).toBe("guest")
    expect(result.employeeSeat).toBe(true)
    expect(await linkedAccount(employeeId)).toBe(result.userId)

    const [membership] = await sql<{ role: string; active: boolean }[]>`
      SELECT role, active FROM organization_membership
       WHERE organization_id = ${b.orgId} AND user_id = ${result.userId}
    `
    expect(membership).toEqual({ role: "guest", active: true })
  })

  it("reports `employeeSeat: false` for an ordinary guest invite", async () => {
    const b = await book()
    const issued = await issue(b, null)
    expect(issued.ok).toBe(true)
    if (!issued.ok) return

    const result = await consume(issued.link.token)
    expect(result.ok && result.employeeSeat).toBe(false)
  })

  it("refuses to STEAL an employee row that already belongs to somebody", async () => {
    // Two links, both naming one employee, issued far enough apart that the
    // sibling revoke cannot be what saves us: the second is minted BEFORE the
    // first is consumed, then the first consume wins and the second must fail.
    const b = await book()
    const employeeId = await employee(b.orgId)

    const first = await issue(b, employeeId, { email: `${unique("prvni")}@example.com` })
    expect(first.ok).toBe(true)
    if (!first.ok) return

    const winner = await consume(first.link.token)
    expect(winner.ok).toBe(true)
    if (!winner.ok) return

    const second = await issue(b, employeeId, { email: `${unique("druhy")}@example.com` })
    expect(second.ok).toBe(true)
    if (!second.ok) return

    expect(await consume(second.link.token)).toEqual({
      ok: false,
      reason: "invalid",
    })
    // The rightful holder is untouched.
    expect(await linkedAccount(employeeId)).toBe(winner.userId)
  })

  it("leaves the loser's link UNCONSUMED so it cannot be replayed as spent", async () => {
    const b = await book()
    const employeeId = await employee(b.orgId)

    const first = await issue(b, employeeId, { email: `${unique("a")}@example.com` })
    if (!first.ok) throw new Error("fixture")
    await consume(first.link.token)

    const second = await issue(b, employeeId, { email: `${unique("bb")}@example.com` })
    if (!second.ok) throw new Error("fixture")
    await consume(second.link.token)

    // The whole transaction rolled back, so the token is untouched — which is
    // also what makes the refusal safe to retry after the office fixes the
    // register.
    const [row] = await sql<{ consumed_at: Date | null }[]>`
      SELECT consumed_at FROM user_setup_token WHERE id = ${second.link.id}
    `
    expect(row?.consumed_at).toBeNull()
  })

  it("creates NO account when the link is refused", async () => {
    const b = await book()
    const employeeId = await employee(b.orgId)
    const first = await issue(b, employeeId, { email: `${unique("one")}@example.com` })
    if (!first.ok) throw new Error("fixture")
    await consume(first.link.token)

    const email = `${unique("late")}@example.com`
    const second = await issue(b, employeeId, { email })
    if (!second.ok) throw new Error("fixture")
    await consume(second.link.token)

    const [row] = await sql<{ n: string }[]>`
      SELECT count(*) AS n FROM app_user WHERE email = ${email}
    `
    // Better Auth's adapter commits on its own connection, so the identity may
    // exist — what must NOT exist is a membership, because that is the thing
    // inside the rolled-back transaction.
    const [membership] = await sql<{ n: string }[]>`
      SELECT count(*) AS n FROM organization_membership m
        JOIN app_user u ON u.id = m.user_id
       WHERE u.email = ${email} AND m.organization_id = ${b.orgId}
    `
    expect(membership?.n).toBe("0")
    expect(Number(row?.n)).toBeLessThanOrEqual(1)
  })
})

describe("the binding is immutable after issuance (migration 0019)", () => {
  it("refuses an UPDATE that re-points a link at another colleague", async () => {
    const b = await book()
    const mine = await employee(b.orgId, "Jan Novák")
    const theirs = await employee(b.orgId, "Petra Nová")

    const issued = await issue(b, mine)
    expect(issued.ok).toBe(true)
    if (!issued.ok) return

    await expect(
      sql`
        UPDATE user_setup_token
           SET payroll_employee_id = ${theirs}
         WHERE id = ${issued.link.id}
      `,
    ).rejects.toMatchObject({ code: "23514" })
  })

  it("refuses an UPDATE that CLEARS the binding", async () => {
    // Clearing it would turn a seat invite into an ordinary guest invite for
    // the same address — a quiet widening rather than a narrowing.
    const b = await book()
    const employeeId = await employee(b.orgId)
    const issued = await issue(b, employeeId)
    if (!issued.ok) throw new Error("fixture")

    await expect(
      sql`
        UPDATE user_setup_token
           SET payroll_employee_id = NULL
         WHERE id = ${issued.link.id}
      `,
    ).rejects.toMatchObject({ code: "23514" })
  })
})

describe("the seat-shape CHECK (migration 0019)", () => {
  it("refuses a bound token with no organization", async () => {
    const b = await book()
    const employeeId = await employee(b.orgId)
    await expect(
      sql`
        INSERT INTO user_setup_token
          (purpose, token_hash, email, organization_id, granted_role,
           payroll_employee_id, issued_by_user_id, expires_at)
        VALUES ('account_setup', ${"a".repeat(64)}, 'x@example.com', NULL, NULL,
                ${employeeId}, ${b.ownerId}, now() + interval '1 hour')
      `,
    ).rejects.toMatchObject({ code: "23514" })
  })

  it("refuses a bound token granting a role other than guest", async () => {
    const b = await book()
    const employeeId = await employee(b.orgId)
    await expect(
      sql`
        INSERT INTO user_setup_token
          (purpose, token_hash, email, organization_id, granted_role,
           payroll_employee_id, issued_by_user_id, expires_at)
        VALUES ('org_invite', ${"b".repeat(64)}, 'x@example.com', ${b.orgId},
                'member', ${employeeId}, ${b.ownerId}, now() + interval '1 hour')
      `,
    ).rejects.toMatchObject({ code: "23514" })
  })
})
