"use client"

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
} from "@workspace/ui/components/creatable-combobox"

type Fruit = { label: string; value: string }

const INITIAL_FRUITS: Fruit[] = [
  { label: "Apple", value: "apple" },
  { label: "Banana", value: "banana" },
  { label: "Cherry", value: "cherry" },
  { label: "Grape", value: "grape" },
  { label: "Orange", value: "orange" },
]

export function CreatableComboboxDemo() {
  const [fruits, setFruits] = React.useState<Fruit[]>(INITIAL_FRUITS)
  const [selected, setSelected] = React.useState<Fruit | null>(null)

  return (
    <div className="flex w-full max-w-xs flex-col gap-2">
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
        <ComboboxInput placeholder="Search or create fruit..." showClear />
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
