import { XmlFilingDebug } from "./_components/xml-filing-debug"

export const metadata = { title: "XML filing · Debug" }

/**
 * Operator XML-filing debug board — import a filing XML (DPPO / DPHDP3 / DPHKH1 /
 * ISDOC), round-trip it through @workspace/filing, XSD-validate the regenerated output,
 * and run the DPPO kritické kontroly. Prod-live (the admin surface is staff-only), not
 * dev-gated. Rendered inside the Platform ▸ Debug tabbed layout.
 */
export default function XmlFilingDebugPage() {
  return <XmlFilingDebug />
}
