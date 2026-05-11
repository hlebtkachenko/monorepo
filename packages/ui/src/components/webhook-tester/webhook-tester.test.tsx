import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { WebhookTester } from "./webhook-tester"

describe("WebhookTester", () => {
  it("disables Send when URL is empty", () => {
    render(<WebhookTester onSend={vi.fn()} />)
    expect(screen.getByRole("button", { name: "Send request" })).toBeDisabled()
  })

  it("calls onSend with form values", async () => {
    const user = userEvent.setup()
    const onSend = vi.fn().mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: {},
      body: { ok: true },
      timing: 12,
    })
    render(<WebhookTester onSend={onSend} defaultUrl="https://x.test/hook" />)
    await user.click(screen.getByRole("button", { name: "Send request" }))
    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://x.test/hook",
        method: "POST",
      }),
    )
  })

  it("renders response status with success token class", async () => {
    const user = userEvent.setup()
    const onSend = vi.fn().mockResolvedValue({
      status: 201,
      statusText: "Created",
      headers: {},
      body: { id: 1 },
      timing: 22,
    })
    render(<WebhookTester onSend={onSend} defaultUrl="https://x.test/hook" />)
    await user.click(screen.getByRole("button", { name: "Send request" }))
    const status = await screen.findByText("201 Created")
    expect(status.className).toContain("text-success")
  })

  it("renders error from rejected onSend", async () => {
    const user = userEvent.setup()
    const onSend = vi.fn().mockRejectedValue(new Error("Network down"))
    render(<WebhookTester onSend={onSend} defaultUrl="https://x.test/hook" />)
    await user.click(screen.getByRole("button", { name: "Send request" }))
    expect(await screen.findByText("Network down")).toBeInTheDocument()
  })

  it("hides body field when method is GET", async () => {
    const user = userEvent.setup()
    render(<WebhookTester onSend={vi.fn()} defaultMethod="GET" />)
    expect(screen.queryByLabelText("Request body")).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText("HTTP method"), "POST")
    expect(screen.getByLabelText("Request body")).toBeInTheDocument()
  })

  it("adds and removes header rows", async () => {
    const user = userEvent.setup()
    render(<WebhookTester onSend={vi.fn()} defaultHeaders={{}} />)
    await user.click(screen.getByRole("button", { name: "Add header" }))
    expect(screen.getByLabelText("Header name")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /Remove/ }))
    expect(screen.queryByLabelText("Header name")).not.toBeInTheDocument()
  })
})
