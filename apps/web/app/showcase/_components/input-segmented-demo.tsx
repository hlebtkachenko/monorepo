"use client"

import { Label } from "@workspace/ui/components/label"
import {
  InputSegmented,
  InputSegmentedItem,
} from "@workspace/ui/components/input-segmented"

export function InputSegmentedDemo() {
  return (
    <div className="flex flex-col gap-2">
      <Label>Date of birth</Label>
      <InputSegmented>
        <InputSegmentedItem
          placeholder="MM"
          maxLength={2}
          className="w-14 text-center"
        />
        <InputSegmentedItem
          placeholder="DD"
          maxLength={2}
          className="w-14 text-center"
        />
        <InputSegmentedItem
          placeholder="YYYY"
          maxLength={4}
          className="w-20 text-center"
        />
      </InputSegmented>
    </div>
  )
}
