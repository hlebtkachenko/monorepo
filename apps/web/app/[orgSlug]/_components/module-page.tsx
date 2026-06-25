"use client"

import { ContentHeader } from "@workspace/ui/blocks/app-content"

import { OrgPageHeader } from "../../_components/org-page-header"

/**
 * A module landing page wired into the persistent shell: it sets its own
 * content-panel header (the module name, portaled into the shell slot via
 * `OrgPageHeader`) and renders a clean placeholder body. Navigating the rail
 * swaps title + sidebar + body together, so the dynamic shell is visible
 * module-to-module. Replace the body with a real `ContentPanel` as each module
 * gets built out.
 */
export function ModulePage({
  title,
  description,
}: {
  title: string
  description?: string
}) {
  return (
    <>
      <OrgPageHeader>
        <ContentHeader title={title} />
      </OrgPageHeader>
      <div className="grid h-full place-items-center p-8 text-center">
        <div className="max-w-md space-y-2">
          <p className="text-lg font-semibold text-foreground">{title}</p>
          <p className="text-sm text-muted-foreground">
            {description ?? "Module content lands here."}
          </p>
        </div>
      </div>
    </>
  )
}
