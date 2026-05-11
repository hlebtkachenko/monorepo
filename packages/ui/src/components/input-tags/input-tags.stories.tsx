import type { Meta, StoryObj } from "@storybook/react"
import * as React from "react"
import {
  InputTags,
  InputTagsInput,
  InputTagsItem,
  InputTagsLabel,
  InputTagsList,
} from "./input-tags"

const meta: Meta<typeof InputTags> = {
  title: "Components/InputTags",
  component: InputTags,
}
export default meta
type Story = StoryObj<typeof InputTags>

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
      <InputTags
        value={tags}
        onValueChange={setTags}
        disabled={disabled}
        editable={editable}
      >
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
