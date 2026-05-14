"use client"

import { useEffect } from "react"
import Link from "next/link"
import { setAuthShellLinkComponent } from "@workspace/ui/blocks/auth-shell"

/**
 * Wire Next.js' `Link` into the framework-agnostic `AuthShellHeader`
 * back-link slot. Without this, back links degrade to plain `<a href>`
 * which is a full page reload (HI-1 in PHASE_REVIEW.md). Client-only so
 * the import is tree-shaken from server bundles that don't render the
 * shell.
 */
export function InstallNextLinkInUi() {
  useEffect(() => {
    setAuthShellLinkComponent(Link)
    return () => setAuthShellLinkComponent(null)
  }, [])
  return null
}
