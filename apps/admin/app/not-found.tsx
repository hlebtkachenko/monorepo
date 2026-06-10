import { ErrorShell } from "@workspace/ui/blocks/app-shell"

// Root 404 surface (OBS-03/H11 parity with web). Bad admin URLs used to
// render Next's unbranded default 404.
export default function NotFound() {
  return <ErrorShell variant="404" homeHref="/" homeLabel="Go home" />
}
