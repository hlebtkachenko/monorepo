"use client"

import * as React from "react"

import {
  TagsInput,
  TagsInputInput,
  TagsInputItem,
  TagsInputLabel,
  TagsInputList,
} from "@workspace/ui/components/tags-input"

export function TagsInputDemo() {
  const [tags, setTags] = React.useState<string[]>([
    "React",
    "TypeScript",
    "Tailwind",
  ])

  return (
    <div className="w-full max-w-md">
      <TagsInput value={tags} onValueChange={setTags}>
        <TagsInputLabel>Technologies</TagsInputLabel>
        <TagsInputList>
          {tags.map((tag) => (
            <TagsInputItem key={tag} value={tag}>
              {tag}
            </TagsInputItem>
          ))}
          <TagsInputInput placeholder="Add tag..." />
        </TagsInputList>
      </TagsInput>
    </div>
  )
}
