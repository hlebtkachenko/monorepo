import { ScalarReference } from "@/components/scalar-reference"

export const dynamic = "force-static"

export const metadata = {
  title: "API Reference",
  description:
    "Full OpenAPI 3.1 reference for the Afframe public API at " +
    "api.afframe.com/v1.",
}

const API_BASE =
  process.env.NEXT_PUBLIC_AFFRAME_API_BASE ?? "https://api.afframe.com"

export default function ReferencePage() {
  return <ScalarReference specUrl={`${API_BASE}/v1/openapi.json`} />
}
