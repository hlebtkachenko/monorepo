import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"

import { InputsDebug } from "./inputs-debug"

describe("InputsDebug", () => {
  it("renders the debug board heading", () => {
    render(<InputsDebug />)
    expect(
      screen.getByRole("heading", { name: /inputs debug board/i }),
    ).toBeInTheDocument()
  })
})
