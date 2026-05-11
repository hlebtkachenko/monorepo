import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
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
})
