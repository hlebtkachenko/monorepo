"use client"

import {
  Mention,
  MentionContent,
  MentionInput,
  MentionItem,
  MentionLabel,
} from "@workspace/ui/components/mention"

const USERS = [
  { id: "alice", label: "Alice Johnson" },
  { id: "bob", label: "Bob Smith" },
  { id: "carol", label: "Carol Lee" },
  { id: "dan", label: "Dan Park" },
]

export function MentionDemo() {
  return (
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
  )
}
