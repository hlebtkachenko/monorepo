"use client"

import Link from "next/link"
import type { ReactNode } from "react"

import { ArrowUpRight } from "@workspace/ui/lib/icons"

import { useAuthHeaderLink } from "./auth-header-link"

interface Props {
  defaultHref: string
  defaultLabel: string
  defaultIcon?: ReactNode
}

export function AuthHeaderRight({
  defaultHref,
  defaultLabel,
  defaultIcon,
}: Props) {
  const { link } = useAuthHeaderLink()
  const href = link?.href ?? defaultHref
  const label = link?.label ?? defaultLabel
  const icon = link?.icon ?? defaultIcon ?? (
    <ArrowUpRight className="size-4" aria-hidden="true" />
  )

  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      {icon}
      {label}
    </Link>
  )
}
