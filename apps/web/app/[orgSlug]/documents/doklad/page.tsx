import { Doklad } from "../../../_components/doklad/doklad"

export const metadata = { title: "Doklad" }

/**
 * The doklad (invoice/document) editor — the Single archetype (an ABRA-style
 * record workspace) on the persistent org shell. A Back button + the document
 * number / status / relation pills sit in the content header. The body is three
 * side-by-side panels (Doklad / Partner / Částky), each with its OWN local tab
 * strip; the Částky panel carries the per-rate VAT recap table. A full-width
 * editable line-items grid sits below, a ContentToolbarLegacy carries the record
 * actions, a ContentStatusBar pins Základ / DPH / Celkem (live off the grid),
 * and a split Uložit / Zavřít footer closes it out. Lives in the Records
 * (documents) module at `/<org>/documents/doklad`. Not gated on NODE_ENV —
 * this is a real page, not a demo.
 */
export default function DokladPage() {
  return <Doklad />
}
