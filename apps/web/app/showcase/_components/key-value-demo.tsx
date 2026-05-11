"use client"

import * as React from "react"
import { TagIcon } from "lucide-react"

import {
  KeyValue,
  KeyValueAdd,
  KeyValueError,
  KeyValueItem,
  KeyValueItemIcon,
  KeyValueKeyInput,
  KeyValueList,
  KeyValueRemove,
  KeyValueValueInput,
  type KeyValueItemData,
} from "@workspace/ui/components/key-value"

const headers: KeyValueItemData[] = [
  { id: "1", key: "Subject", value: "Welcome aboard" },
  { id: "2", key: "From", value: "team@example.com" },
  { id: "3", key: "Reply-To", value: "noreply@example.com" },
]

export function KeyValueDemo() {
  const [vars, setVars] = React.useState<KeyValueItemData[]>(headers)

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">
          Default
        </h3>
        <KeyValue value={vars} onValueChange={setVars}>
          <KeyValueList>
            <KeyValueItem>
              <div className="flex w-40 flex-col gap-1">
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
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">
          With icon
        </h3>
        <KeyValue defaultValue={headers}>
          <KeyValueList>
            <KeyValueItem>
              <KeyValueItemIcon>
                <TagIcon />
              </KeyValueItemIcon>
              <div className="flex w-40 flex-col gap-1">
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
      </div>
    </div>
  )
}
