import { SectionFormView } from "./section-form-view"

export const metadata = { title: "Section Form" }

/**
 * Settings → Debug → Section Form — the reference page for the **Form** section:
 * a two-column group (title + description on the left, a 6-column field grid on
 * the right, fields spanning 1–6 columns). The section is minted inside the
 * client `SectionFormView` (a branded descriptor cannot cross the RSC boundary).
 */
export default function SectionFormPage() {
  return <SectionFormView />
}
