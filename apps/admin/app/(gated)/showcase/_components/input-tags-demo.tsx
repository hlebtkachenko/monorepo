"use client"

import * as React from "react"

import {
  InputTags,
  InputTagsInput,
  InputTagsItem,
  InputTagsLabel,
  InputTagsList,
} from "@workspace/ui/components/input-tags"

export function InputTagsDemo() {
  const [tags, setTags] = React.useState<string[]>([
    "React",
    "TypeScript",
    "Tailwind",
  ])

  return (
    <div className="w-full max-w-md">
      <InputTags value={tags} onValueChange={setTags}>
        <InputTagsLabel>Technologies</InputTagsLabel>
        <InputTagsList>
          {tags.map((tag) => (
            <InputTagsItem key={tag} value={tag}>
              {tag}
            </InputTagsItem>
          ))}
          <InputTagsInput placeholder="Add tag..." />
        </InputTagsList>
      </InputTags>
    </div>
  )
}
