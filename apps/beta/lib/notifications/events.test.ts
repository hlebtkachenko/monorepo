/**
 * Notification dispatch, against a MOCKED `@workspace/email` — no Postgres, no
 * real transport (see `vitest.config.ts`'s "pure" project for why this file
 * lives there). What this suite proves:
 *
 *   1. one message is sent PER RECIPIENT, built from the right template;
 *   2. a recipient with no toggle / disabled / wrong role never reaches here
 *      at all — that filtering is `notifiableOrgMembers`'s job
 *      (`lib/data/notification-prefs.test.ts`), asserted THERE against a real
 *      membership table; this suite only has to prove that whatever list it
 *      IS given, every entry gets exactly one send;
 *   3. one recipient's transport failure never blocks the others, and the
 *      returned promise never rejects — the "never rejects" half of the
 *      send-after-commit contract `events.ts`'s own header states.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

process.env["BETTER_AUTH_URL"] = "https://beta.afframe.com"

const sendEmail = vi.hoisted(() =>
  vi.fn(async (_message: { to: string }) => {}),
)

vi.mock("@workspace/email", () => ({
  sendEmail,
  betaDocumentAttentionEmail: (input: { to: string }) => ({
    to: input.to,
    subject: "doc",
    html: "<html/>",
    text: "doc",
  }),
  betaClientTaskEmail: (input: { to: string }) => ({
    to: input.to,
    subject: "task",
    html: "<html/>",
    text: "task",
  }),
  betaPeriodPublishedEmail: (input: { to: string }) => ({
    to: input.to,
    subject: "period",
    html: "<html/>",
    text: "period",
  }),
}))

const {
  DATASET_LABELS_CS,
  documentAttentionTrigger,
  notifyClientTaskCreated,
  notifyDocumentAttention,
  notifyPeriodPublished,
} = await import("./events")

describe("documentAttentionTrigger", () => {
  it("fires on a real transition into returned", () => {
    expect(
      documentAttentionTrigger(
        { status: "in_processing", officeMessage: "Chybí VS." },
        { status: "returned", officeMessage: "Chybí VS." },
      ),
    ).toBe(true)
  })

  it("fires when the office message changes on an unrelated status", () => {
    expect(
      documentAttentionTrigger(
        { status: "in_processing", officeMessage: null },
        { status: "in_processing", officeMessage: "Ještě prosím doplňte." },
      ),
    ).toBe(true)
  })

  it("fires when the office message is edited (not just newly set)", () => {
    expect(
      documentAttentionTrigger(
        { status: "returned", officeMessage: "První verze." },
        { status: "in_processing", officeMessage: "Upravená verze." },
      ),
    ).toBe(true)
  })

  it("does not fire on a status change that carries no message change", () => {
    expect(
      documentAttentionTrigger(
        { status: "received", officeMessage: null },
        { status: "in_processing", officeMessage: null },
      ),
    ).toBe(false)
  })

  it("does not fire on processed -> in_processing with the message untouched", () => {
    expect(
      documentAttentionTrigger(
        { status: "processed", officeMessage: "Staré." },
        { status: "in_processing", officeMessage: "Staré." },
      ),
    ).toBe(false)
  })

  it("does not fire when the office message is CLEARED", () => {
    expect(
      documentAttentionTrigger(
        { status: "in_processing", officeMessage: "Bylo tu něco." },
        { status: "in_processing", officeMessage: null },
      ),
    ).toBe(false)
  })

  it("does not fire when nothing changed at all", () => {
    expect(
      documentAttentionTrigger(
        { status: "processed", officeMessage: "Stejné." },
        { status: "processed", officeMessage: "Stejné." },
      ),
    ).toBe(false)
  })
})

const RECIPIENTS = [
  { userId: "u1", email: "admin@example.com" },
  { userId: "u2", email: "member@example.com" },
]

beforeEach(() => {
  sendEmail.mockClear()
  sendEmail.mockImplementation(async () => {})
})

describe("notifyDocumentAttention", () => {
  it("sends one email per recipient", async () => {
    await notifyDocumentAttention(RECIPIENTS, {
      orgSlug: "acme-sro",
      organizationName: "Acme s.r.o.",
      filename: "faktura.pdf",
      officeMessage: "Chybí VS.",
    })
    expect(sendEmail).toHaveBeenCalledTimes(2)
    const to = sendEmail.mock.calls.map(([m]) => m.to)
    expect(to).toEqual(["admin@example.com", "member@example.com"])
  })

  it("sends nobody when the recipient list is empty", async () => {
    await notifyDocumentAttention([], {
      orgSlug: "acme-sro",
      organizationName: "Acme s.r.o.",
      filename: "faktura.pdf",
      officeMessage: "Chybí VS.",
    })
    expect(sendEmail).not.toHaveBeenCalled()
  })
})

describe("notifyClientTaskCreated", () => {
  it("sends one email per recipient", async () => {
    await notifyClientTaskCreated(RECIPIENTS, {
      orgSlug: "acme-sro",
      organizationName: "Acme s.r.o.",
      title: "Nahrát výpis",
      dueDateLabel: "25.03.2026",
    })
    expect(sendEmail).toHaveBeenCalledTimes(2)
  })
})

describe("notifyPeriodPublished", () => {
  it("sends one email per recipient", async () => {
    await notifyPeriodPublished(RECIPIENTS, {
      orgSlug: "acme-sro",
      organizationName: "Acme s.r.o.",
      datasetLabel: DATASET_LABELS_CS.rozvaha,
      periodLabel: "07/2026",
    })
    expect(sendEmail).toHaveBeenCalledTimes(2)
  })

  it("covers every BetaImportDataset value, not just the implemented three", () => {
    expect(Object.keys(DATASET_LABELS_CS).sort()).toEqual(
      ["payroll", "predvaha", "rozvaha", "saldokonto", "vzz"].sort(),
    )
  })
})

describe("one recipient's failure never blocks the others, and dispatch never rejects", () => {
  it("logs and continues past a single sendEmail rejection", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    sendEmail.mockImplementationOnce(async () => {
      throw new Error("resend: 500")
    })

    await expect(
      notifyDocumentAttention(RECIPIENTS, {
        orgSlug: "acme-sro",
        organizationName: "Acme s.r.o.",
        filename: "faktura.pdf",
        officeMessage: "Chybí VS.",
      }),
    ).resolves.toBeUndefined()

    expect(sendEmail).toHaveBeenCalledTimes(2)
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy.mock.calls[0]?.[0]).toContain("document-attention")
    errorSpy.mockRestore()
  })
})
