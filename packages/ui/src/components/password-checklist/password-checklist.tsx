"use client"

import * as React from "react"
import { Check, Circle } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"
import {
  PASSWORD_RULES,
  evaluatePassword,
  type PasswordRuleKey,
} from "@workspace/shared/auth"

export interface PasswordChecklistProps {
  value: string
  labels: Record<PasswordRuleKey, string>
  className?: string
}

function PasswordChecklist({
  value,
  labels,
  className,
}: PasswordChecklistProps) {
  const results = evaluatePassword(value)

  return (
    <ul
      role="list"
      aria-live="polite"
      aria-label="Password requirements"
      className={cn(
        "grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2",
        className,
      )}
    >
      {PASSWORD_RULES.map((rule) => {
        const passing = results[rule.key]
        return (
          <li
            key={rule.key}
            className={cn(
              "flex items-center gap-2 text-sm transition-colors",
              passing ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {passing ? (
              <Check className="size-4 shrink-0 text-foreground" />
            ) : (
              <Circle className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span>{labels[rule.key]}</span>
          </li>
        )
      })}
    </ul>
  )
}

export { PasswordChecklist }
