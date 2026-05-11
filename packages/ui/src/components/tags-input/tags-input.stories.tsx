import type { Meta, StoryObj } from "@storybook/react"
import * as React from "react"
import {
  TagsInput,
  TagsInputInput,
  TagsInputItem,
  TagsInputLabel,
  TagsInputList,
} from "./tags-input"

const meta: Meta<typeof TagsInput> = {
  title: "Components/TagsInput",
  component: TagsInput,
}
export default meta
type Story = StoryObj<typeof TagsInput>

function Composed({
  defaultValue = ["React", "TypeScript", "Tailwind"],
  disabled,
  editable,
}: {
  defaultValue?: string[]
  disabled?: boolean
  editable?: boolean
}) {
  const [tags, setTags] = React.useState(defaultValue)
  return (
    <div className="w-full max-w-md">
      <TagsInput
        value={tags}
        onValueChange={setTags}
        disabled={disabled}
        editable={editable}
      >
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

export const Default: Story = {
  render: () => <Composed />,
}

export const Empty: Story = {
  render: () => <Composed defaultValue={[]} />,
}

export const Editable: Story = {
  render: () => <Composed editable />,
}

export const Disabled: Story = {
  render: () => <Composed disabled />,
}
