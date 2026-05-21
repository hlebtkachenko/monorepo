import { ErrorShell } from "@workspace/ui/blocks/app-shell"

export default function OrgNotFound() {
  return (
    <ErrorShell
      variant="404"
      homeHref="/workspace"
      homeLabel="Back to workspace"
    />
  )
}
