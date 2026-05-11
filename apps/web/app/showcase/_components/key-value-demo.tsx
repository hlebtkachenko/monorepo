"use client"

import * as React from "react"

import {
  KeyValue,
  KeyValueAdd,
  KeyValueError,
  KeyValueItem,
  KeyValueKeyInput,
  KeyValueList,
  KeyValueRemove,
  KeyValueValueInput,
  type KeyValueItemData,
} from "@workspace/ui/components/key-value"

export function KeyValueDemo() {
  const [vars, setVars] = React.useState<KeyValueItemData[]>([
    { id: "1", key: "Subject", value: "Welcome aboard" },
    { id: "2", key: "From", value: "team@example.com" },
    { id: "3", key: "Reply-To", value: "noreply@example.com" },
  ])

  return (
    <KeyValue value={vars} onValueChange={setVars}>
      <KeyValueList>
        <KeyValueItem>
          <div className="flex flex-col gap-1">
            <KeyValueKeyInput />
            <KeyValueError field="key" />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <KeyValueValueInput />
            <KeyValueError field="value" />
          </div>
          <KeyValueRemove />
        </KeyValueItem>
      </KeyValueList>
      <KeyValueAdd />
    </KeyValue>
  )
}
