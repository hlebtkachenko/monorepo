"use client"

import { Zap } from "lucide-react"
import {
  BorderBeamButton,
  BorderBeamIconButton,
} from "@workspace/ui/components/button-border-beam"

export function BorderBeamDemo() {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <BorderBeamButton>Default</BorderBeamButton>
      <BorderBeamButton variant="outline">Outline</BorderBeamButton>
      <BorderBeamButton variant="secondary">Secondary</BorderBeamButton>
      <BorderBeamButton variant="destructive">Delete</BorderBeamButton>
      <BorderBeamIconButton aria-label="Zap">
        <Zap />
      </BorderBeamIconButton>
    </div>
  )
}
