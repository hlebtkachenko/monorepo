/**
 * Afframe sleeping-page Worker.
 *
 * Serves the self-contained static page in public/index.html as HTTP 503 for
 * every request it receives. It only receives requests while its routes are
 * bound — which happens only during a deliberate env pause (see
 * scripts/routes.sh / docs/runbooks/ENV-POWER.md). When the app is live there
 * are no bound routes, so this Worker sees no production traffic.
 *
 * Browsers get the HTML page; machine clients on api.* hosts get a JSON 503.
 */

interface Env {
  ASSETS: Fetcher
}

const COMMON_HEADERS: Record<string, string> = {
  "retry-after": "300",
  "cache-control": "no-store",
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.hostname.startsWith("api.") || url.hostname.startsWith("api-")) {
      return new Response(
        JSON.stringify({
          error: "service_unavailable",
          message:
            "Afframe is asleep to save resources. It will be back shortly.",
        }),
        {
          status: 503,
          headers: {
            ...COMMON_HEADERS,
            "content-type": "application/json; charset=utf-8",
          },
        },
      )
    }

    // Always serve the single static page regardless of the requested path.
    const assetUrl = new URL(url.toString())
    assetUrl.pathname = "/index.html"
    const asset = await env.ASSETS.fetch(new Request(assetUrl.toString()))

    return new Response(asset.body, {
      status: 503,
      headers: {
        ...COMMON_HEADERS,
        "content-type": "text/html; charset=utf-8",
      },
    })
  },
}
