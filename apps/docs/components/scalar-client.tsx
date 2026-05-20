"use client"

import { ApiReferenceReact } from "@scalar/api-reference-react"

import "@scalar/api-reference-react/style.css"

import { BASE_SCALAR_CONFIG } from "./scalar-config"

/**
 * Scalar API Client widget. Same Scalar React entry as the Reference but
 * mounted in client mode (hide the marketing sidebar, focus on the
 * request builder). When `@scalar/api-client-react` ships as its own
 * export, swap this component over.
 */
export function ScalarClient({ specUrl }: { specUrl: string }) {
  return (
    <ApiReferenceReact
      configuration={{
        ...BASE_SCALAR_CONFIG,
        url: specUrl,
        hideModels: true,
        hideTestRequestButton: false,
      }}
    />
  )
}
