"use client"

import { ApiReferenceReact } from "@scalar/api-reference-react"

import "@scalar/api-reference-react/style.css"

/**
 * Scalar API Reference React widget. The api at `api.afframe.com/` already
 * renders this same widget against the same spec; this mount exists so the
 * docs site can frame the reference inside the rest of the developer
 * hub (sidebar nav, Ask AI, cross-links to guides) and so search engines
 * see it at `docs.afframe.com/reference` alongside the narrative content.
 */
export function ScalarReference({ specUrl }: { specUrl: string }) {
  return (
    <ApiReferenceReact
      configuration={{
        url: specUrl,
        theme: "default",
        layout: "modern",
        persistAuth: true,
        defaultOpenAllTags: true,
        authentication: { preferredSecurityScheme: "bearer" },
        defaultHttpClient: { targetKey: "shell", clientKey: "curl" },
        hiddenClients: {
          c: true,
          clojure: true,
          csharp: true,
          dart: true,
          fsharp: true,
          kotlin: true,
          objc: true,
          ocaml: true,
          powershell: true,
          r: true,
          swift: true,
        },
        metaData: { title: "Afframe API Reference" },
      }}
    />
  )
}
