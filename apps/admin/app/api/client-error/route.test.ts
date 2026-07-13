import { afterEach, describe, expect, it, vi } from "vitest"

import { POST } from "./route"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("admin client-error route", () => {
  it("forwards utility button reports to canonical feedback as a bug", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        Response.json(
          { received: true, referenceId: "fb_test" },
          { status: 201 },
        ),
      )
    const request = new Request("http://admin.local/api/client-error", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "sec-fetch-site": "same-origin",
        "x-forwarded-for": "203.0.113.10",
      },
      body: JSON.stringify({
        type: "bug",
        message: "Utility page failed",
        id: "utility_test",
        context: {
          page: {
            url: "https://admin.afframe.com/utility/test",
            pathname: "/utility/test",
          },
        },
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      referenceId: "fb_test",
    })
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/v1/feedback",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"type":"bug"'),
      }),
    )
  })
})
