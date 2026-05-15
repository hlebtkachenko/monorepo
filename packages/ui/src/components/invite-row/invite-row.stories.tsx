import type { Meta, StoryObj } from "@storybook/react"
import { useState } from "react"

import { InviteRow, InviteRowAddButton } from "./invite-row"

const meta: Meta<typeof InviteRow> = {
  title: "Components/InviteRow",
  component: InviteRow,
  decorators: [
    (Story) => (
      <div className="max-w-2xl p-4">
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof InviteRow>

export const Empty: Story = {
  args: {
    email: "",
    role: "member",
    removable: true,
    onEmailChange: () => {},
    onRoleChange: () => {},
    onRemove: () => {},
  },
}

export const Filled: Story = {
  args: {
    email: "jane@example.com",
    role: "admin",
    removable: true,
    onEmailChange: () => {},
    onRoleChange: () => {},
    onRemove: () => {},
  },
}

export const NotRemovable: Story = {
  args: {
    email: "owner@example.com",
    role: "admin",
    removable: false,
    onEmailChange: () => {},
    onRoleChange: () => {},
    onRemove: () => {},
  },
}

export const List: Story = {
  render: function ListStory() {
    const [rows, setRows] = useState([
      { id: 1, email: "alice@example.com", role: "admin" as const },
      { id: 2, email: "bob@example.com", role: "member" as const },
      { id: 3, email: "", role: "member" as const },
    ])

    function updateEmail(id: number, value: string) {
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, email: value } : r)),
      )
    }

    function updateRole(id: number, value: "admin" | "member") {
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, role: value } : r)),
      )
    }

    function removeRow(id: number) {
      setRows((prev) => prev.filter((r) => r.id !== id))
    }

    function addRow() {
      setRows((prev) => [
        ...prev,
        { id: Date.now(), email: "", role: "member" as const },
      ])
    }

    return (
      <div className="flex flex-col gap-2">
        {rows.map((row, index) => (
          <InviteRow
            key={row.id}
            email={row.email}
            role={row.role}
            removable={index > 0}
            onEmailChange={(value) => updateEmail(row.id, value)}
            onRoleChange={(value) => updateRole(row.id, value)}
            onRemove={() => removeRow(row.id)}
          />
        ))}
        <InviteRowAddButton onClick={addRow} />
      </div>
    )
  },
}
