import type { ReactNode } from "react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardAction,
} from "@workspace/ui/components/card"
import { Heading } from "@workspace/ui/components/heading"
import { Text } from "@workspace/ui/components/text"
import { Separator } from "@workspace/ui/components/separator"

interface SectionProps {
  title?: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}

export function Section({
  title,
  description,
  actions,
  children,
}: SectionProps) {
  return (
    <section className="flex flex-col gap-4 py-4">
      {(title || description || actions) && (
        <>
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-1">
              {title ? (
                <Heading level={2} className="mt-0">
                  {title}
                </Heading>
              ) : null}
              {description ? <Text variant="muted">{description}</Text> : null}
            </div>
            {actions ? (
              <div className="flex shrink-0 gap-2">{actions}</div>
            ) : null}
          </div>
          <Separator />
        </>
      )}
      <div>{children}</div>
    </section>
  )
}

export function SectionCard({
  title,
  description,
  actions,
  children,
}: SectionProps) {
  return (
    <Card>
      {(title || description || actions) && (
        <CardHeader>
          {title ? <CardTitle>{title}</CardTitle> : null}
          {description ? (
            <CardDescription>{description}</CardDescription>
          ) : null}
          {actions ? <CardAction>{actions}</CardAction> : null}
        </CardHeader>
      )}
      <CardContent>{children}</CardContent>
    </Card>
  )
}
