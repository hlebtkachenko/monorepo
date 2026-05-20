import { ScalarClient } from "@/components/scalar-client"

export const dynamic = "force-static"

export const metadata = {
  title: "API Client",
  description:
    "Interactive request builder for the Afframe public API, generated " +
    "from the live OpenAPI spec.",
}

const API_BASE =
  process.env.NEXT_PUBLIC_AFFRAME_API_BASE ?? "https://api.afframe.com"

export default function ClientPage() {
  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">API Client</h1>
        <p className="text-muted-foreground">
          Compose live requests against the Afframe API. Paste your API key,
          pick an endpoint, fire and inspect the response.
        </p>
      </header>
      <ScalarClient specUrl={`${API_BASE}/v1/openapi.json`} />
    </section>
  )
}
