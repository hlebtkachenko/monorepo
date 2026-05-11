"use client"

import { Label } from "@workspace/ui/components/label"
import {
  SegmentedInput,
  SegmentedInputItem,
} from "@workspace/ui/components/segmented-input"

export function SegmentedInputDemo() {
  return (
    <div className="flex flex-col gap-2">
      <Label>Date of birth</Label>
      <SegmentedInput>
        <SegmentedInputItem
          placeholder="MM"
          maxLength={2}
          className="w-14 text-center"
        />
        <SegmentedInputItem
          placeholder="DD"
          maxLength={2}
          className="w-14 text-center"
        />
        <SegmentedInputItem
          placeholder="YYYY"
          maxLength={4}
          className="w-20 text-center"
        />
      </SegmentedInput>
    </div>
  )
}
