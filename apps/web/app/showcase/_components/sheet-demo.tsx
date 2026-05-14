"use client"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@workspace/ui/components/sheet"
import { Button } from "@workspace/ui/components/button"

const sides = ["top", "right", "bottom", "left"] as const

export function SheetDemo() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {sides.map((side) => (
        <Sheet key={side}>
          <SheetTrigger asChild>
            <Button variant="outline" className="capitalize">
              {side}
            </Button>
          </SheetTrigger>
          <SheetContent side={side}>
            <SheetHeader>
              <SheetTitle className="capitalize">Sheet from {side}</SheetTitle>
              <SheetDescription>
                This sheet slides in from the {side} edge of the screen.
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-2 px-4">
              <p className="text-sm text-muted-foreground">
                Use sheets for secondary content that does not require leaving
                the current context.
              </p>
            </div>
            <SheetFooter>
              <SheetClose asChild>
                <Button variant="outline">Close</Button>
              </SheetClose>
              <Button>Save</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      ))}
    </div>
  )
}
