"use client"

import {
  ContentHeader,
  ContentPanel,
  sectionForm,
} from "@workspace/ui/blocks/content-panel"
import { AppPageHeader } from "@workspace/ui/blocks/app-shell"

/**
 * Client view for the Section Form debug page. Branded section descriptors must
 * be minted AND consumed within the same client boundary — the `Symbol` brand
 * does not survive RSC serialisation, so a Server Component cannot build a
 * descriptor and pass it to the client `ContentPanel`. (This is the same seam
 * an archetype provides once one exists.) Reproduces the "Legal identity" group
 * from org settings.
 */
export function SectionFormView() {
  return (
    <>
      <AppPageHeader>
        <ContentHeader title="Section Form" />
      </AppPageHeader>
      <ContentPanel
        sections={[
          sectionForm({
            anchor: "legal-identity",
            title: "Legal identity",
            description:
              "How this účetní jednotka is named on filings and výkazy.",
            fields: [
              {
                label: "Legal name",
                name: "legal_name",
                span: 4,
                control: { kind: "text", value: "Developer Workspace" },
              },
              {
                label: "Legal form",
                name: "legal_form",
                span: 2,
                control: {
                  kind: "select",
                  placeholder: "Not set",
                  options: [
                    { label: "s.r.o.", value: "sro" },
                    { label: "a.s.", value: "as" },
                  ],
                },
              },
              {
                label: "IČO",
                name: "ico",
                span: 2,
                control: {
                  kind: "text",
                  placeholder: "00000000",
                  inputMode: "numeric",
                },
              },
              {
                label: "DIČ",
                name: "dic",
                span: 2,
                control: { kind: "text", placeholder: "—", disabled: true },
              },
              {
                label: "Person kind",
                name: "person_kind",
                span: 2,
                control: {
                  kind: "text",
                  value: "legal_entity",
                  disabled: true,
                },
              },
            ],
          }),
        ]}
      />
    </>
  )
}
