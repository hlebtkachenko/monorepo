import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MultiStepLoader } from "./multi-step-loader"

const states = [{ text: "Step 1" }, { text: "Step 2" }, { text: "Step 3" }]

describe("MultiStepLoader", () => {
  it("renders steps when loading", () => {
    render(<MultiStepLoader loadingStates={states} loading />)
    expect(screen.getByRole("status")).toBeInTheDocument()
    expect(screen.getByText("Step 1")).toBeInTheDocument()
  })

  it("renders nothing when not loading", () => {
    render(<MultiStepLoader loadingStates={states} loading={false} />)
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })

  it("renders close button when onClose is provided", () => {
    render(<MultiStepLoader loadingStates={states} loading onClose={vi.fn()} />)
    expect(
      screen.getByRole("button", { name: "Close loader" }),
    ).toBeInTheDocument()
  })

  it("omits close button when onClose is not provided", () => {
    render(<MultiStepLoader loadingStates={states} loading />)
    expect(
      screen.queryByRole("button", { name: "Close loader" }),
    ).not.toBeInTheDocument()
  })

  it("invokes onClose when the close button is clicked", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<MultiStepLoader loadingStates={states} loading onClose={onClose} />)
    await user.click(screen.getByRole("button", { name: "Close loader" }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
