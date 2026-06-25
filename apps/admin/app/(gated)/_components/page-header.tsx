import type { ReactNode } from "react"

import { Heading } from "@workspace/ui/components/heading"
import { Separator } from "@workspace/ui/components/separator"
import { Text } from "@workspace/ui/components/text"

interface PageHeaderProps {
  title: string
  description?: string
  breadcrumb?: string
  actions?: ReactNode
  meta?: ReactNode
}

export function PageHeader({
  title,
  description,
  actions,
  meta,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <Heading level={1} className="mt-0 truncate">
            {title}
          </Heading>
          {description ? (
            <Text variant="muted" className="max-w-2xl">
              {description}
            </Text>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
      </div>
      {meta ? (
        <div className="text-sm text-muted-foreground">{meta}</div>
      ) : null}
      <Separator />
    </div>
  )
}
