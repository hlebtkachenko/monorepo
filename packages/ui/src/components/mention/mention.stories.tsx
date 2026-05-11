import type { Meta, StoryObj } from "@storybook/react"
import {
  Mention,
  MentionContent,
  MentionInput,
  MentionItem,
  MentionLabel,
} from "./mention"

const meta: Meta<typeof Mention> = {
  title: "Components/Mention",
  component: Mention,
}
export default meta
type Story = StoryObj<typeof Mention>

const USERS = [
  { id: "alice", label: "Alice Johnson" },
  { id: "bob", label: "Bob Smith" },
  { id: "carol", label: "Carol Lee" },
  { id: "dan", label: "Dan Park" },
]

export const Default: Story = {
  render: () => (
    <div className="w-full max-w-md">
      <Mention>
        <MentionInput placeholder="Type @ to mention someone..." />
        <MentionContent>
          {USERS.map((user) => (
            <MentionItem key={user.id} value={user.label}>
              {user.label}
            </MentionItem>
          ))}
        </MentionContent>
      </Mention>
    </div>
  ),
}

export const WithLabel: Story = {
  render: () => (
    <div className="w-full max-w-md">
      <Mention>
        <MentionInput placeholder="Type @ to mention someone..." />
        <MentionContent>
          <MentionLabel>Team members</MentionLabel>
          {USERS.map((user) => (
            <MentionItem key={user.id} value={user.label}>
              {user.label}
            </MentionItem>
          ))}
        </MentionContent>
      </Mention>
    </div>
  ),
}

export const Disabled: Story = {
  render: () => (
    <div className="w-full max-w-md">
      <Mention>
        <MentionInput placeholder="Disabled input" disabled />
        <MentionContent>
          {USERS.map((user) => (
            <MentionItem key={user.id} value={user.label}>
              {user.label}
            </MentionItem>
          ))}
        </MentionContent>
      </Mention>
    </div>
  ),
}
