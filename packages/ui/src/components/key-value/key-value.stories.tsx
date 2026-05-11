import type { Meta, StoryObj } from "@storybook/react"
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
} from "./key-value"

const meta: Meta<typeof KeyValue> = {
  title: "Components/KeyValue",
  component: KeyValue,
}
export default meta
type Story = StoryObj<typeof KeyValue>

function Composed(args: React.ComponentProps<typeof KeyValue>) {
  return (
    <KeyValue {...args}>
      <KeyValueList>
        <KeyValueItem>
          <div className="flex flex-col gap-1">
            <KeyValueKeyInput />
            <KeyValueError field="key" />
          </div>
          <div className="flex flex-col gap-1">
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

const sample: KeyValueItemData[] = [
  { id: "1", key: "Subject", value: "Welcome aboard" },
  { id: "2", key: "From", value: "team@example.com" },
  { id: "3", key: "Reply-To", value: "noreply@example.com" },
]

export const Default: Story = {
  render: () => <Composed defaultValue={sample} />,
}

export const Empty: Story = {
  render: () => <Composed />,
}

export const Horizontal: Story = {
  render: (args) => (
    <KeyValue {...args} defaultValue={sample}>
      <KeyValueList orientation="horizontal">
        <KeyValueItem>
          <KeyValueKeyInput />
          <KeyValueValueInput />
          <KeyValueRemove />
        </KeyValueItem>
      </KeyValueList>
      <KeyValueAdd />
    </KeyValue>
  ),
}

export const MaxItems: Story = {
  render: () => <Composed defaultValue={sample} maxItems={3} />,
}

export const MinItems: Story = {
  render: () => <Composed defaultValue={sample.slice(0, 1)} minItems={1} />,
}

export const WithValidation: Story = {
  render: () => (
    <Composed
      defaultValue={sample}
      onKeyValidate={(key) =>
        key.length > 0 && !/^[A-Z][A-Za-z0-9-]*$/.test(key)
          ? "Must start with uppercase letter"
          : undefined
      }
    />
  ),
}

export const Disabled: Story = {
  render: () => <Composed defaultValue={sample} disabled />,
}

export const ReadOnly: Story = {
  render: () => <Composed defaultValue={sample} readOnly />,
}

export const DuplicateKeysAllowed: Story = {
  render: () => (
    <Composed
      defaultValue={[
        { id: "1", key: "Cookie", value: "session=abc" },
        { id: "2", key: "Cookie", value: "theme=dark" },
      ]}
      allowDuplicateKeys
    />
  ),
}
