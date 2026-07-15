# Inspector body sections

Reusable, data-driven sections a page composes into an Inspector tab's `content`
node. Every section reads the shared edit context (`inspector-edit-context.tsx`),
so the header's **Edit** toggle flips their editable fields on.

Doctrine: each section takes typed data props, composes an **existing** library
primitive, and uses design tokens only. No hardcoded copy, colors, or layout
magic numbers outside the token system.

Built to Hleb's reference screenshots. An earlier exploratory pass (field-group,
summary, timeline, line-items, callout, comments, related-items, tags) was
scrapped and moved out of the tree — these six are the shipped set.

| Section                  | Purpose                                                                                                                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inspector-key-details`  | Headline record properties at the top of a tab — borderless, click-to-edit values that stay plain text until clicked; the header **Edit** toggle folds every editable line open at once. |
| `inspector-money-totals` | Borderless money breakdown with an emphasised grand-total row; body-text sizing/tokens match every other section.                                                                        |
| `inspector-attachments`  | File/link list matching the reference: hairline list card, dotted divider, always-present dashed drop zone, "Add link" / "Link existing". A reusable section, not a tab.                 |
| `inspector-activity`     | Activity-tab event log composed from the Timeline primitive (status dot, title, time, description).                                                                                      |
| `inspector-paragraph`    | Titled prose block for descriptions or AI summaries; no card — title above, prose on the body; swaps to a Textarea in edit mode.                                                         |
| `inspector-section`      | Shared frame: title ABOVE the content (outside any box, a little bigger) + optional description/icon/action.                                                                             |
| `inspector-edit-context` | Body-wide edit-mode seam (foundation).                                                                                                                                                   |

**Details tables** (debit/credit posting, invoice line items, sub-documents) use the shared **`DetailsTableGrid`** from `@workspace/ui/blocks/content-panel` — the content-panel Details Table minus its archetype two-column frame — NOT a bespoke inspector table.
