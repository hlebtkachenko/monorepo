"use client"

import { ApiReferenceReact } from "@scalar/api-reference-react"

import "@scalar/api-reference-react/style.css"

import { BASE_SCALAR_CONFIG, REFERENCE_HIDDEN_CLIENTS } from "./scalar-config"

/**
 * Scalar API Reference React widget. `api.afframe.com/` already renders
 * this same widget against the same spec; the mount here exists so the
 * docs site can frame the reference inside the rest of the developer hub
 * (sidebar nav, Ask AI, cross-links to guides) and so search engines see
 * it at `docs.afframe.com/reference` alongside the narrative content.
 */
export function ScalarReference({ specUrl }: { specUrl: string }) {
  return (
    <ApiReferenceReact
      configuration={{
        ...BASE_SCALAR_CONFIG,
        url: specUrl,
        defaultOpenAllTags: true,
        hiddenClients: REFERENCE_HIDDEN_CLIENTS,
        metaData: { title: "Afframe API Reference" },
      }}
    />
  )
}
