import type { Meta, StoryObj } from "@storybook/react"
import * as React from "react"
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

const meta: Meta<typeof CreatableCombobox> = {
  title: "Components/CreatableCombobox",
  component: CreatableCombobox,
}
export default meta

type Story = StoryObj<typeof CreatableCombobox>

type Fruit = { label: string; value: string }

const INITIAL_FRUITS: Fruit[] = [
  { label: "Apple", value: "apple" },
  { label: "Banana", value: "banana" },
  { label: "Cherry", value: "cherry" },
  { label: "Grape", value: "grape" },
  { label: "Orange", value: "orange" },
]

function Single() {
  const [fruits, setFruits] = React.useState<Fruit[]>(INITIAL_FRUITS)
  const [selected, setSelected] = React.useState<Fruit | null>(null)

  return (
    <div className="flex w-full max-w-xs flex-col gap-2">
      <label className="text-sm font-medium">Pick or create a fruit</label>
      <CreatableCombobox
        items={fruits}
        value={selected}
        onValueChange={(val) => setSelected(val as Fruit | null)}
        onCreateValue={(value) => {
          const next = {
            label: value,
            value: value.toLowerCase().replace(/\s+/g, "-"),
          }
          setFruits((prev) => [...prev, next])
          setSelected(next)
        }}
      >
        <ComboboxInput placeholder="Search fruits..." showClear />
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
      {selected && (
        <p className="text-xs text-muted-foreground">
          Selected: {selected.label}
        </p>
      )}
    </div>
  )
}

export const Default: Story = {
  render: () => <Single />,
}

function CreateLast() {
  const [items, setItems] = React.useState<Fruit[]>(INITIAL_FRUITS)
  const [selected, setSelected] = React.useState<Fruit | null>(null)
  return (
    <div className="flex w-full max-w-xs flex-col gap-2">
      <CreatableCombobox
        items={items}
        value={selected}
        onValueChange={(val) => setSelected(val as Fruit | null)}
        onCreateValue={(value) => {
          const next = { label: value, value: value.toLowerCase() }
          setItems((prev) => [...prev, next])
          setSelected(next)
        }}
        createOptionPosition="last"
      >
        <ComboboxInput placeholder="Type a fruit..." showClear />
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
    </div>
  )
}

export const CreateOptionLast: Story = {
  render: () => <CreateLast />,
}

function CustomCreateLabel() {
  const [items, setItems] = React.useState<Fruit[]>(INITIAL_FRUITS)
  const [selected, setSelected] = React.useState<Fruit | null>(null)
  return (
    <div className="flex w-full max-w-xs flex-col gap-2">
      <CreatableCombobox
        items={items}
        value={selected}
        onValueChange={(val) => setSelected(val as Fruit | null)}
        onCreateValue={(value) => {
          const next = { label: value, value: value.toLowerCase() }
          setItems((prev) => [...prev, next])
          setSelected(next)
        }}
        createLabel={(v) => `+ Add "${v}" as new fruit`}
      >
        <ComboboxInput placeholder="Search fruits..." showClear />
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
    </div>
  )
}

export const WithCustomCreateLabel: Story = {
  render: () => <CustomCreateLabel />,
}
