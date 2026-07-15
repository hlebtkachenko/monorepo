"use client"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import { ScrollArea } from "@workspace/ui/components/scroll-area"

export interface ProfileHistoryEvent {
  id: string
  action: string
  at: string
}

export function ProfileHistorySheet({
  events,
  open,
  onOpenChange,
}: {
  events: ProfileHistoryEvent[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full! sm:max-w-lg!">
        <SheetHeader>
          <SheetTitle>Profile history</SheetTitle>
          <SheetDescription>
            Audited changes made through profile and account settings.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          {events.length > 0 ? (
            <ol className="px-4 pb-4">
              {events.map((event) => (
                <li
                  key={event.id}
                  className="grid gap-1 border-b border-border py-4 last:border-b-0"
                >
                  <span className="font-medium text-foreground">
                    {event.action}
                  </span>
                  <time className="text-sm text-muted-foreground">
                    {event.at}
                  </time>
                </li>
              ))}
            </ol>
          ) : (
            <p className="px-4 py-8 text-sm text-muted-foreground">
              No audited profile changes yet.
            </p>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
