"use client"

import { ApiReferenceReact } from "@scalar/api-reference-react"

import "@scalar/api-reference-react/style.css"

/**
 * Scalar API Client widget — same Scalar React entry as the Reference,
 * but mounted in a layout-only-the-client mode (hide the marketing sidebar,
 * focus on the request builder). When `@scalar/api-client-react` ships as
 * its own export, swap this component over for a cleaner UI.
 */
export function ScalarClient({ specUrl }: { specUrl: string }) {
  return (
    <ApiReferenceReact
      configuration={{
        url: specUrl,
        theme: "default",
        layout: "modern",
        persistAuth: true,
        hideModels: true,
        hideTestRequestButton: false,
        authentication: { preferredSecurityScheme: "bearer" },
        defaultHttpClient: { targetKey: "shell", clientKey: "curl" },
      }}
    />
  )
}
