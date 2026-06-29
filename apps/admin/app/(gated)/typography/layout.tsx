import type { ReactNode } from "react"

import { SectionGate } from "../_components/section-gate"

export default function Layout({ children }: { children: ReactNode }) {
  return <SectionGate path="/typography">{children}</SectionGate>
}
