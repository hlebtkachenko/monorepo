import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { EnvEditor } from "./env-editor"

describe("EnvEditor", () => {
  it("renders provided variables", () => {
    render(<EnvEditor value={[{ key: "API_KEY", value: "secret" }]} />)
    expect(screen.getByDisplayValue("API_KEY")).toBeInTheDocument()
  })

  it("masks values by default", () => {
    render(<EnvEditor value={[{ key: "TOKEN", value: "shh" }]} />)
    const valueInput = screen.getByLabelText(
      "Value for TOKEN",
    ) as HTMLInputElement
    expect(valueInput.type).toBe("password")
  })

  it("toggles mask visibility", async () => {
    const user = userEvent.setup()
    render(<EnvEditor value={[{ key: "TOKEN", value: "shh" }]} />)
    await user.click(screen.getByRole("button", { name: "Show value" }))
    const valueInput = screen.getByLabelText(
      "Value for TOKEN",
    ) as HTMLInputElement
    expect(valueInput.type).toBe("text")
  })

  it("adds a new variable row", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<EnvEditor onChange={onChange} />)
    await user.click(
      screen.getByRole("button", { name: "Add new environment variable" }),
    )
    expect(onChange).toHaveBeenCalledWith([{ key: "", value: "" }])
  })

  it("removes a variable row", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<EnvEditor value={[{ key: "X", value: "1" }]} onChange={onChange} />)
    await user.click(screen.getByRole("button", { name: "Remove X" }))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it("hides remove button in readOnly", () => {
    render(<EnvEditor value={[{ key: "X", value: "1" }]} readOnly />)
    expect(
      screen.queryByRole("button", { name: "Remove X" }),
    ).not.toBeInTheDocument()
  })

  it("shows empty state when no variables", () => {
    render(<EnvEditor />)
    expect(screen.getByText("No environment variables")).toBeInTheDocument()
  })
})
