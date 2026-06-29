import "server-only"

import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Text } from "@workspace/ui/components/text"

import { PageHeader } from "@/app/(gated)/_components/page-header"
import { Section } from "@/app/(gated)/_components/section"
import { auditAdminAction } from "@/lib/admin-audit"

export const metadata = { title: "Email deliverability" }
export const dynamic = "force-dynamic"

interface ResendStats {
  reachable: boolean
  sent: number | null
  bounced: number | null
  complained: number | null
  delivered: number | null
  openRate: number | null
  detail: string
}

async function probeResend(): Promise<ResendStats> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return {
      reachable: false,
      sent: null,
      bounced: null,
      complained: null,
      delivered: null,
      openRate: null,
      detail: "RESEND_API_KEY not set — running in stub mode",
    }
  }
  // Resend's stats endpoint is not on the public REST surface in 1.x; the
  // metrics live in the dashboard. We stop at "key configured" so the page
  // renders the right state without inventing numbers.
  return {
    reachable: true,
    sent: null,
    bounced: null,
    complained: null,
    delivered: null,
    openRate: null,
    detail:
      "Resend API key detected; live metrics need the Resend Insights endpoint (not yet wired).",
  }
}

export default async function EmailDeliverabilityPage() {
  const r = await probeResend()
  await auditAdminAction({
    action: "admin.platform.email_deliverability_viewed",
    payload: { reachable: r.reachable },
  })

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Email deliverability"
        description="Bounce / complaint / open rate for outbound transactional email (Resend). Catches reputation drops before the customer-facing impact."
        meta={
          <Badge variant={r.reachable ? "secondary" : "outline"}>
            {r.reachable ? "Provider reachable" : "Stub mode"}
          </Badge>
        }
      />

      <Section>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Delivered</CardTitle>
            </CardHeader>
            <CardContent>
              <Text className="text-3xl font-semibold">
                {r.delivered ?? "—"}
              </Text>
              <Text variant="muted" className="text-xs">
                Last 7 days
              </Text>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Bounced</CardTitle>
            </CardHeader>
            <CardContent>
              <Text className="text-3xl font-semibold">{r.bounced ?? "—"}</Text>
              <Text variant="muted" className="text-xs">
                Hard + soft bounces
              </Text>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Complained</CardTitle>
            </CardHeader>
            <CardContent>
              <Text className="text-3xl font-semibold">
                {r.complained ?? "—"}
              </Text>
              <Text variant="muted" className="text-xs">
                Spam reports
              </Text>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Open rate</CardTitle>
            </CardHeader>
            <CardContent>
              <Text className="text-3xl font-semibold">
                {r.openRate !== null ? `${r.openRate}%` : "—"}
              </Text>
              <Text variant="muted" className="text-xs">
                Tracked opens / delivered
              </Text>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section
        title="Why are the numbers blank?"
        description="The Resend Insights endpoint isn't wired yet. Today this page proves the route + audit + role gate works; metrics fill in once the integration lands."
      >
        <Text variant="muted" className="text-sm">
          {r.detail}
        </Text>
      </Section>
    </div>
  )
}
