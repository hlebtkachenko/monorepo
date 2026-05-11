import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ApiResponseViewer } from "./api-response-viewer"

describe("ApiResponseViewer", () => {
  it("renders status badge with correct text", () => {
    render(<ApiResponseViewer response={{ status: 200, statusText: "OK" }} />)
    const badge = screen.getByRole("status")
    expect(badge).toHaveTextContent("200 OK")
  })

  it("hides body tab when body is undefined", () => {
    render(<ApiResponseViewer response={{ status: 204 }} />)
    expect(screen.queryByRole("tab", { name: "Body" })).not.toBeInTheDocument()
  })

  it("shows headers tab when headers exist", async () => {
    const user = userEvent.setup()
    render(
      <ApiResponseViewer
        response={{
          status: 200,
          headers: { "content-type": "application/json" },
          body: {},
        }}
      />,
    )
    await user.click(screen.getByRole("tab", { name: "Headers" }))
    expect(screen.getByText("content-type")).toBeInTheDocument()
  })

  it("shows total timing in header", () => {
    render(
      <ApiResponseViewer response={{ status: 200, timing: { total: 123 } }} />,
    )
    expect(screen.getByText("123ms")).toBeInTheDocument()
  })

  it("renders 5xx with destructive status class", () => {
    render(<ApiResponseViewer response={{ status: 500 }} />)
    const badge = screen.getByRole("status")
    expect(badge.className).toContain("text-destructive")
  })
})
