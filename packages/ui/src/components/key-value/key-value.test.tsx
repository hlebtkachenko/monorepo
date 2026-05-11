import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  KeyValue,
  KeyValueAdd,
  KeyValueItem,
  KeyValueKeyInput,
  KeyValueList,
  KeyValueRemove,
  KeyValueValueInput,
  type KeyValueItemData,
} from "./key-value"

function Composed({
  value,
  onValueChange,
  ...rest
}: {
  value?: KeyValueItemData[]
  onValueChange?: (v: KeyValueItemData[]) => void
} & React.ComponentProps<typeof KeyValue>) {
  return (
    <KeyValue
      {...(value !== undefined ? { value } : {})}
      {...(onValueChange ? { onValueChange } : {})}
      {...rest}
    >
      <KeyValueList>
        <KeyValueItem>
          <KeyValueKeyInput />
          <KeyValueValueInput />
          <KeyValueRemove />
        </KeyValueItem>
      </KeyValueList>
      <KeyValueAdd />
    </KeyValue>
  )
}

describe("KeyValue", () => {
  it("renders one empty row by default", () => {
    render(<Composed />)
    expect(screen.getAllByRole("listitem")).toHaveLength(1)
  })

  it("renders provided items", () => {
    const data = [
      { id: "1", key: "name", value: "hleb" },
      { id: "2", key: "lang", value: "ts" },
    ]
    render(<Composed value={data} />)
    expect(screen.getAllByRole("listitem")).toHaveLength(2)
    expect(screen.getByDisplayValue("name")).toBeInTheDocument()
  })

  it("adds a row on Add click", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Composed onValueChange={onChange} />)
    await user.click(screen.getByRole("button", { name: /Add/ }))
    expect(onChange).toHaveBeenCalled()
    const lastCall = onChange.mock.calls.at(-1)?.[0] as KeyValueItemData[]
    expect(lastCall).toHaveLength(2)
  })

  it("removes a row on Remove click", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const data = [
      { id: "1", key: "a", value: "1" },
      { id: "2", key: "b", value: "2" },
    ]
    render(<Composed value={data} onValueChange={onChange} />)
    const removeButtons = screen.getAllByRole("button", { name: "Remove row" })
    await user.click(removeButtons[0]!)
    const lastCall = onChange.mock.calls.at(-1)?.[0] as KeyValueItemData[]
    expect(lastCall).toHaveLength(1)
    expect(lastCall[0]?.key).toBe("b")
  })

  it("disables remove when at minItems", () => {
    render(
      <Composed value={[{ id: "1", key: "x", value: "1" }]} minItems={1} />,
    )
    expect(screen.getByRole("button", { name: "Remove row" })).toBeDisabled()
  })
})
