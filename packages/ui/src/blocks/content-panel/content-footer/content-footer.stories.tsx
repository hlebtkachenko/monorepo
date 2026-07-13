import type { Meta, StoryObj } from "@storybook/react"

import { IconProvider } from "@workspace/ui/icon-packs"

import { ContentFooter } from "./content-footer"

/**
 * `ContentFooter` is the single sticky bottom action surface of the Content
 * Panel — a normal-flow layout row (nothing scrolls below it) with two
 * mutually-exclusive, DATA-driven modes: `selection` (bulk actions over N
 * chosen rows) and `save` (Unsaved changes / Discard / Save). It self-hides:
 * `selection` disappears at count 0, `save` disappears when not dirty.
 */
const meta = {
  title: "Blocks/Content Panel/ContentFooter",
  component: ContentFooter,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <IconProvider>
        <Story />
      </IconProvider>
    ),
  ],
} satisfies Meta<typeof ContentFooter>

export default meta
type Story = StoryObj<typeof meta>

export const Selection: Story = {
  args: {
    selection: {
      count: 3,
      onClear: () => {},
      actions: [
        { id: "match", label: "Match", icon: "LinkIcon", onSelect: () => {} },
        { id: "edit", label: "Edit", icon: "Pencil", onSelect: () => {} },
        {
          id: "delete",
          label: "Delete",
          icon: "Trash2",
          variant: "destructive",
          onSelect: () => {},
        },
      ],
    },
  },
}

export const Save: Story = {
  args: {
    save: {
      dirty: true,
      onSave: () => {},
      onDiscard: () => {},
    },
  },
}

export const Saving: Story = {
  args: {
    save: {
      dirty: true,
      saving: true,
      onSave: () => {},
      onDiscard: () => {},
    },
  },
}
