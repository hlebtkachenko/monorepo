import { auditAdminAction } from "@/lib/admin-audit"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { PageHeader } from "../../_components/page-header"
import { ARCHETYPES } from "./archetype-catalog"

export const metadata = { title: "Archetypes" }

export default async function ArchetypesPage() {
  await auditAdminAction({
    action: "admin.platform.archetypes_viewed",
    payload: { total: ARCHETYPES.length },
  })

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Archetypes"
        description="Reference catalog of the content-panel archetypes and their slot recipes."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ARCHETYPES.map((archetype) => (
          <Card key={archetype.slug} className="h-full">
            <CardHeader>
              <CardTitle>{archetype.label}</CardTitle>
              <CardDescription>{archetype.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <p className="font-mono text-xs text-muted-foreground">
                {archetype.slots}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
