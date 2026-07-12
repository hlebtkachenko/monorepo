# 30. Statutory periods and legal dates are independent of accounting periods

- Status: **Proposed**
- Date: 2026-07-09
- Deciders: Hleb Tkachenko

## Context and Problem Statement

The accounting period is the boundary of one set of books. Czech VAT returns,
control statements, and EC sales lists instead use statutory calendar months or
quarters. A fiscal accounting year may begin in any month, so one statutory VAT
quarter can overlap two accounting periods. Restricting a VAT query to one
`accounting_period.id` truncates that statutory period and can omit evidence.

The current capture model also stores the accounting event time as a
`timestamptz` and VAT outputs cast it to `date`. That cast depends on the
PostgreSQL session timezone. It also treats the event time as both the taxable
supply date and the date on which a received document became eligible for an
input VAT deduction. Those are distinct legal facts and may fall in different
months.

Finally, historical records do not contain a proven received-document date.
Deriving one from `created_at`, document issue time, or the accounting event
time would create evidence that the source document did not supply.

## Domain definitions

- **Accounting period:** the bounded interval owned by one set of books. It
  controls posting, closing, and period-level read models.
- **Statutory period:** the calendar-aligned interval for one return, statement,
  payment, or report. It is independent of the accounting-period identifier.
- **Legal date:** a civil `date` whose meaning comes from Czech law or source
  evidence, not an instant converted through the server or browser timezone.
- **Effective fact:** a sourced organization or payroll fact with an inclusive
  validity interval. Consumers resolve it for each affected interval.
- **Schedule candidate:** a possible due-date occurrence produced by a general
  cadence rule before taxpayer facts and activity evidence are evaluated.
- **Applicable obligation:** a schedule candidate for which effective facts and
  evidence prove that the organization must act.
- **Filing record:** evidence that an applicable obligation was filed, paid,
  accepted, rejected, or otherwise progressed. A due date is not a filing
  record.
- **Presentation status:** a UI projection derived from applicability, due date,
  completeness, and filing records. It is not itself legal or filing evidence.

## Decision

An accounting period remains the immutable book boundary. A statutory filing
period is a separate calendar-aligned value identified by an inclusive
`from`/`to` date range. Statutory VAT output queries use the organization scope
provided by FORCE RLS plus that filing range, and may aggregate evidence from
multiple accounting periods.

Czech legal dates are stored as PostgreSQL `date` values and represented at the
TypeScript boundary as validated ISO `YYYY-MM-DD` strings. Taxable-supply date
and received-document or deduction-eligibility date are separate fields. Input
VAT is not asserted as eligible until the required date evidence is present.
Unknown historical receipt dates remain unknown.

## Consequences

Positive:

- Non-calendar fiscal years can produce complete calendar VAT periods.
- Database, application, and browser timezones cannot change a legal date.
- Output VAT and input VAT can use the legal date appropriate to each rule.
- Missing evidence produces an explicit incomplete state instead of a false
  deduction or fabricated date.
- Organization RLS remains the tenant boundary while queries cross book periods.

Negative / trade-offs:

- VAT builders can no longer assume that one `period_id` contains all relevant
  evidence.
- Capture requests need additional document date fields and older clients must
  be updated before they can produce complete VAT artifacts.
- Historical received documents without receipt evidence may make a VAT result
  incomplete until a user supplies or verifies the missing date.
- Queries need organization-and-date indexes because the `period_id` index is no
  longer sufficient for statutory output reads.

Follow-up work required:

- Add nullable legal-date columns with checks and indexes through a handwritten,
  idempotent migration governed by ADR-0009.
- Update capture schemas, API code generation, and held-write replay paths.
- Introduce an explicit statutory-period query scope in the VAT output package.
- Add completeness metadata to VAT results when required legal evidence is
  absent.
- Implement the schedule-candidate, applicable-obligation, filing-record, and
  presentation-status boundaries in the obligation-model refactor.

## Alternatives considered

- **Clip the statutory period to the active accounting period.** Rejected
  because the result is not the statutory calendar month or quarter.
- **Use a single `period_id` and load the adjacent period ad hoc.** Rejected
  because it preserves the wrong ownership model and fails when more than one
  boundary is involved.
- **Keep `timestamptz` and force every query to Europe/Prague.** Rejected because
  a legal date is not an instant and taxable-supply and receipt dates would
  remain conflated.
- **Backfill receipt date from issue, event, or creation timestamps.** Rejected
  because those values do not prove when the recipient obtained the tax
  document.
- **Store all legal dates on each VAT line.** Rejected for the current document
  model because the reviewed VAT outputs and Czech filing rows operate at the
  document header. A later feature may add line-level dates if source documents
  require them.

## See also

- [Remediation issue #625](https://github.com/hlebtkachenko/monorepo/issues/625)
- [Financial Administration: VAT control-statement periods](https://financnisprava.gov.cz/cs/dane/dane/dan-z-pridane-hodnoty/kontrolni-hlaseni-dph/kdy),
  verified 2026-07-09
- [Financial Administration: EC sales-list periods](https://financnisprava.gov.cz/cs/dane/dane/dan-z-pridane-hodnoty/informace-stanoviska-a-sdeleni/souhrnna-hlaseni/podavani-souhrnneho-hlaseni-od-roku-2010-a-dale),
  verified 2026-07-09
- [Official control-statement instructions: received document and deduction
  evidence](https://www.e-sbirka.cz/sbr-cache/souborove-dokumenty/787855/ORIGINAL/ZOBRAZ/sbcr2023c060z0112u004),
  verified 2026-07-09
- [Financial Administration: 2026 tax calendar](https://financnisprava.gov.cz/cs/danovy-kalendar),
  verified 2026-07-09
- ADR-0009, handwritten SQL migrations
- ADR-0010, organization FORCE RLS
- Code anchors landing with issue #625:
  `packages/accounting/src/output/`, `packages/accounting/src/obligations/`,
  `packages/db/src/schema/summary_record.ts`, and
  `apps/web/app/[orgSlug]/closing/vat/_lib/vat-data.ts`
