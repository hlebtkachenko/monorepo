import { Test, type TestingModule } from "@nestjs/testing"
import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("@workspace/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}))

import { ValidationError } from "@workspace/shared/errors"
import { sendEmail } from "@workspace/email"
import { FeedbackController } from "./feedback.controller"

describe("FeedbackController", () => {
  let controller: FeedbackController

  beforeEach(async () => {
    vi.clearAllMocks()
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FeedbackController],
    }).compile()
    controller = module.get(FeedbackController)
  })

  it("returns 201-shape body with received=true + opaque referenceId", async () => {
    const result = await controller.create({
      type: "bug",
      message: "Repro: hit /v1/ping with a malformed Bearer header.",
    })
    expect(result.received).toBe(true)
    expect(result.referenceId).toMatch(/^fb_[A-Za-z0-9_-]+$/)
  })

  it("sends an email to support+feedback@afframe.com via Resend transport", async () => {
    await controller.create({
      type: "request",
      message: "Add idempotency-key support to /v1/feedback.",
      email: "dev@partner.example",
    })
    expect(sendEmail).toHaveBeenCalledTimes(1)
    const call = vi.mocked(sendEmail).mock.calls[0]?.[0]
    expect(call?.to).toBe("support+feedback@afframe.com")
    expect(call?.subject).toContain("[Afframe feedback · request]")
    expect(call?.text).toContain("dev@partner.example")
    expect(call?.text).toContain("idempotency-key")
  })

  it("does not throw when the email transport fails — logs + returns 201", async () => {
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error("transport down"))
    const result = await controller.create({
      type: "issue",
      message: "Documentation is missing on the Sandbox page.",
    })
    expect(result.received).toBe(true)
    expect(result.referenceId).toMatch(/^fb_/)
  })

  it("accepts optional in-app context and folds it into the email body", async () => {
    const result = await controller.create({
      type: "bug",
      message: "Save button does nothing on the invoice editor.",
      context: {
        page: {
          url: "https://app.afframe.com/acme/invoices/42",
          pathname: "/acme/invoices/42",
        },
        scope: { org_slug: "acme", reporter_email: "owner@example.com" },
        element: { tag: "button", dom_path: "main > form > button.save" },
        viewport: {
          width: 1440,
          height: 900,
          scroll_y: 0,
          device_pixel_ratio: 2,
        },
        client: { user_agent: "Mozilla/5.0 (Macintosh)" },
      },
    })
    expect(result.received).toBe(true)
    const call = vi.mocked(sendEmail).mock.calls[0]?.[0]
    expect(call?.text).toContain("/acme/invoices/42")
    expect(call?.text).toContain("main > form > button.save")
    expect(call?.text).toContain("acme")
  })

  it("omits the context block entirely for bare submissions", async () => {
    await controller.create({
      type: "question",
      message: "How do I rotate an API key?",
    })
    const call = vi.mocked(sendEmail).mock.calls[0]?.[0]
    expect(call?.text).not.toContain("---")
    expect(call?.text).not.toContain("**Where**")
  })

  it("rejects an invalid body with a domain ValidationError (maps to 422)", async () => {
    await expect(
      controller.create({ type: "bogus", message: "" }),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(sendEmail).not.toHaveBeenCalled()
  })
})
