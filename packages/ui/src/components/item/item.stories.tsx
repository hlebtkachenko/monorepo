import type { Meta, StoryObj } from "@storybook/react"
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
  ItemMedia,
} from "./item"

const meta: Meta<typeof Item> = {
  title: "Components/Item",
  component: Item,
}
export default meta
type Story = StoryObj<typeof Item>

export const Default: Story = {
  render: () => (
    <Item>
      <ItemContent>
        <ItemTitle>Item title</ItemTitle>
        <ItemDescription>A short description of this item.</ItemDescription>
      </ItemContent>
    </Item>
  ),
}

export const WithActions: Story = {
  render: () => (
    <Item variant="outline">
      <ItemMedia variant="icon">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="size-4"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Document.pdf</ItemTitle>
        <ItemDescription>Uploaded 2 hours ago</ItemDescription>
      </ItemContent>
      <ItemActions>
        <button>Delete</button>
      </ItemActions>
    </Item>
  ),
}

export const Outline: Story = {
  args: { children: "Outline", variant: "outline" },
}

export const Muted: Story = {
  args: { children: "Muted", variant: "muted" },
}

export const SizeSm: Story = {
  args: { children: "Sm", size: "sm" },
}

export const SizeXs: Story = {
  args: { children: "Xs", size: "xs" },
}

export const Icon: Story = {
  render: () => (
    <Item>
      <ItemMedia variant="icon">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Icon item</ItemTitle>
      </ItemContent>
    </Item>
  ),
}

export const Image: Story = {
  render: () => (
    <Item>
      <ItemMedia variant="image">
        <img src="https://placehold.co/40x40" alt="Preview" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Image item</ItemTitle>
      </ItemContent>
    </Item>
  ),
}
