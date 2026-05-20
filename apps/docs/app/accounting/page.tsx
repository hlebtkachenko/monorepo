export default function AccountingIndex() {
  return (
    <section className="prose prose-neutral dark:prose-invert flex max-w-3xl flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight">Accounting</h1>
      <p className="text-muted-foreground">
        Czech-specific concepts and conventions. Topics ship as MDX in Phase C3
        — this page is a placeholder.
      </p>
      <ul className="list-disc pl-6 text-sm text-muted-foreground">
        <li>Double-entry primer</li>
        <li>Chart of accounts (Czech standard)</li>
        <li>VAT (DPH), DIČ / IČO validation</li>
        <li>ISDOC 6.0.1 invoice exchange</li>
        <li>FX conversion + period booking</li>
        <li>Fiscal year, year-end close</li>
        <li>Glossary (CZ ↔ EN)</li>
      </ul>
    </section>
  )
}
