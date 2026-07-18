import { ErrorShell } from "@workspace/ui/blocks/app-shell"

export default function OrgNotFound() {
  // Home points into the app (the workspace hub), never the marketing root: the
  // missing route may well be a bad org slug, so the org home isn't safe here.
  return <ErrorShell variant="404" homeHref="/workspace" />
}
