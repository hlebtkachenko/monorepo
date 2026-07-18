# ISDOC test fixtures

Valid ISDOC 6.0.1 XML documents used by `isdoc.test.ts` to exercise `parseIsdoc`.

They were generated once from the canonical models in
`packages/filing/fixtures/isdoc/*.json` via `generateIsdoc`
(`packages/filing/src/cz/isdoc/write.ts`), which is XSD-validated by the filing
package's own round-trip tests. Regenerate by running `generateIsdoc` over the
matching source model if the writer changes. They are committed (not generated at
test time) so `@workspace/intake` keeps no dependency on `@workspace/filing`.

| File                   | Case                                                  |
| ---------------------- | ----------------------------------------------------- |
| `01-common.isdoc`      | Standard domestic invoice, bank transfer, 21 %        |
| `02-cash.isdoc`        | Cash payment (PaymentMeansCode 10)                    |
| `05-credit-note.isdoc` | Dobropis (DocumentType 2) — negative amounts          |
| `06-advance.isdoc`     | Advance tax document (DocumentType 5)                 |
| `07-simplified.isdoc`  | Simplified doc (DocumentType 7), anonymous customer   |
| `09-pdp.isdoc`         | Domestic reverse charge (§92, LocalReverseChargeFlag) |
| `10-non-czk.isdoc`     | Foreign currency (EUR) with CZK local amounts         |
