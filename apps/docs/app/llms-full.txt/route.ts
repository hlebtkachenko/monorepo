import "server-only"

import { getCorpus, specPath } from "@/lib/ai/corpus"

export const dynamic = "force-static"

/**
 * `/llms-full.txt` — concatenated developer corpus. Plain text dump of
 * the OpenAPI spec plus the narrative page summaries that ground Ask AI.
 * Single fetch for any agent that wants the full ground truth.
 */
export function GET(): Response {
  return new Response(getCorpus(specPath()), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=3600",
    },
  })
}
