import * as React from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
import {
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@workspace/ui/components/combobox"
import {
  ComboboxItemCreatable,
  CreatableCombobox,
  isCreatableItem,
  type CreatableItem,
} from "./creatable-combobox"

type Fruit = { label: string; value: string }

const INITIAL: Fruit[] = [
  { label: "Apple", value: "apple" },
  { label: "Banana", value: "banana" },
]

function Harness({ onCreate }: { onCreate?: (v: string) => void }) {
  const [items, setItems] = React.useState<Fruit[]>(INITIAL)
  const [selected, setSelected] = React.useState<Fruit | null>(null)
  return (
    <CreatableCombobox
      items={items}
      value={selected}
      onValueChange={(val) => setSelected(val as Fruit | null)}
      onCreateValue={(value) => {
        onCreate?.(value)
        const next = { label: value, value: value.toLowerCase() }
        setItems((prev) => [...prev, next])
        setSelected(next)
      }}
    >
      <ComboboxInput placeholder="Search fruits..." />
      <ComboboxContent>
        <ComboboxList>
          {(item: Fruit | CreatableItem) =>
            isCreatableItem(item) ? (
              <ComboboxItemCreatable key="__create__" value={item} />
            ) : (
              <ComboboxItem key={item.value} value={item}>
                {item.label}
              </ComboboxItem>
            )
          }
        </ComboboxList>
      </ComboboxContent>
    </CreatableCombobox>
  )
}

describe("CreatableCombobox", () => {
  it("isCreatableItem narrows correctly", () => {
    expect(isCreatableItem({ creatable: true, label: "x", value: "x" })).toBe(
      true,
    )
    expect(isCreatableItem({ label: "x", value: "x" })).toBe(false)
    expect(isCreatableItem("foo")).toBe(false)
  })

  it("renders the input placeholder", () => {
    render(<Harness />)
    expect(screen.getByPlaceholderText("Search fruits...")).toBeInTheDocument()
  })

  it("shows a creatable item when query has no exact match", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const input = screen.getByPlaceholderText("Search fruits...")
    await user.click(input)
    await user.type(input, "Mango")
    expect(await screen.findByText(/Create "Mango"/)).toBeInTheDocument()
  })

  it("does not show creatable item when query matches existing", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const input = screen.getByPlaceholderText("Search fruits...")
    await user.click(input)
    await user.type(input, "Apple")
    expect(screen.queryByText(/Create "Apple"/)).not.toBeInTheDocument()
  })

  it("calls onCreateValue handler reference", () => {
    const onCreate = vi.fn()
    render(<Harness onCreate={onCreate} />)
    expect(onCreate).not.toHaveBeenCalled()
  })
})
