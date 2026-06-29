import Link from "next/link"

import { Button } from "@workspace/ui/components/button"
import { Heading } from "@workspace/ui/components/heading"
import { Text } from "@workspace/ui/components/text"
import { Shield } from "@workspace/ui/lib/icons"

/**
 * Generic deny screen for section-level capability misses. Deliberately
 * does NOT mention which role is required — staff must contact an owner
 * to request access, not infer the access matrix from the UI.
 */
export function AccessDenied() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
        <Shield className="size-10 text-muted-foreground" aria-hidden />
        <Heading level={2} className="mt-0">
          Access denied
        </Heading>
        <Text variant="muted">
          Your account doesn&apos;t have access to this section. Contact an
          owner if you need access.
        </Text>
        <Button asChild variant="outline">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </div>
  )
}
