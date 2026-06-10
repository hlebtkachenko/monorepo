import { ErrorShell } from "@workspace/ui/blocks/app-shell"

// Root 404 surface (H11). Non-org bad URLs (e.g. /nonexistent) used to render
// Next's unbranded default; org-scoped 404s are handled by
// app/[orgSlug]/not-found.tsx.
export default function NotFound() {
  return <ErrorShell variant="404" homeHref="/" homeLabel="Go home" />
}
