"use client"

import * as React from "react"

import {
  EnvEditor,
  type EnvVariable,
} from "@workspace/ui/components/env-editor"

export function EnvEditorDemo() {
  const [vars, setVars] = React.useState<EnvVariable[]>([
    { key: "DATABASE_URL", value: "postgres://user:pass@localhost:5432/app" },
    { key: "API_KEY", value: "sk_live_abc123" },
    { key: "NODE_ENV", value: "production" },
  ])

  return <EnvEditor value={vars} onChange={setVars} />
}
