import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
import { InviteRow, InviteRowAddButton } from "./invite-row"

function renderRow(overrides: Partial<Parameters<typeof InviteRow>[0]> = {}) {
  const props = {
    email: "",
    role: "member" as const,
    onEmailChange: vi.fn(),
    onRoleChange: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  }
  render(<InviteRow {...props} />)
  return props
}

describe("InviteRow", () => {
  it("email input updates onEmailChange", async () => {
    const user = userEvent.setup()
    const { onEmailChange } = renderRow()
    const input = screen.getByRole("textbox", { name: "Email" })
    await user.type(input, "abc")
    // Each keypress fires onEmailChange once; assert it was called at least once
    // and the concatenation of all call arguments equals the typed text.
    expect(onEmailChange).toHaveBeenCalled()
    const mock = vi.mocked(onEmailChange)
    const typed = mock.mock.calls.map((c) => c[0] as string).join("")
    expect(typed).toBe("abc")
  })

  it("role select updates onRoleChange", async () => {
    const user = userEvent.setup()
    const { onRoleChange } = renderRow({ role: "member" })
    await user.click(screen.getByRole("combobox", { name: "Role" }))
    await user.click(screen.getByRole("option", { name: "Admin" }))
    expect(onRoleChange).toHaveBeenCalledWith("admin")
  })

  it("remove button calls onRemove when removable=true", async () => {
    const user = userEvent.setup()
    const { onRemove } = renderRow({ removable: true })
    await user.click(screen.getByRole("button", { name: "Remove" }))
    expect(onRemove).toHaveBeenCalledOnce()
  })

  it("remove button is disabled when removable=false", () => {
    renderRow({ removable: false })
    expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled()
  })
})

describe("InviteRowAddButton", () => {
  it("renders with a Plus icon and label", () => {
    render(<InviteRowAddButton onClick={vi.fn()} />)
    const btn = screen.getByRole("button", { name: /add member/i })
    expect(btn).toBeInTheDocument()
    expect(btn.querySelector("svg")).toBeInTheDocument()
  })

  it("calls onClick when clicked", async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<InviteRowAddButton onClick={onClick} />)
    await user.click(screen.getByRole("button", { name: /add member/i }))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
