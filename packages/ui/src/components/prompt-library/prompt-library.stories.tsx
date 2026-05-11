import { Fragment } from "react"
import type { Meta, StoryObj } from "@storybook/react"

import {
  type Prompt,
  PromptLibrary,
  PromptLibraryCategory,
  PromptLibraryContent,
  PromptLibraryCreateDialog,
  PromptLibraryCreateTrigger,
  PromptLibraryEmpty,
  PromptLibraryFooter,
  PromptLibraryItem,
  PromptLibraryList,
  PromptLibrarySearch,
  PromptLibrarySeparator,
  PromptLibraryTrigger,
} from "./prompt-library"

const meta: Meta<typeof PromptLibrary> = {
  title: "Components/PromptLibrary",
  component: PromptLibrary,
}
export default meta
type Story = StoryObj<typeof PromptLibrary>

const DEFAULT_PROMPTS: Prompt[] = [
  {
    id: "code-review",
    title: "Code Review",
    description: "Review code for best practices and bugs",
    prompt:
      "Please review the following code for best practices, potential bugs, and improvements:\n\n[paste code here]",
    category: "Development",
  },
  {
    id: "summarize",
    title: "Summarize",
    description: "Summarize a long passage of text",
    prompt:
      "Summarize the following text in 3-5 bullet points:\n\n[paste text here]",
    category: "Writing",
  },
  {
    id: "explain",
    title: "Explain Like I am 5",
    description: "Simple explanation of a complex topic",
    prompt: "Explain the following topic as if I am 5 years old:\n\n[topic]",
    category: "Education",
  },
  {
    id: "translate",
    title: "Translate to English",
    description: "Translate text into natural English",
    prompt: "Translate the following text into natural English:\n\n[text]",
    category: "Writing",
  },
]

function renderLibrary(prompts: Prompt[]) {
  return (
    <PromptLibrary prompts={prompts}>
      <PromptLibraryTrigger />
      <PromptLibraryContent>
        <PromptLibrarySearch />
        <PromptLibraryList>
          <PromptLibraryEmpty />
          <PromptLibraryCategory>
            {prompts.map((p) => (
              <PromptLibraryItem key={p.id} prompt={p} />
            ))}
          </PromptLibraryCategory>
        </PromptLibraryList>
        <PromptLibrarySeparator />
        <PromptLibraryFooter>
          <PromptLibraryCreateTrigger />
        </PromptLibraryFooter>
      </PromptLibraryContent>
      <PromptLibraryCreateDialog />
    </PromptLibrary>
  )
}

export const Default: Story = {
  render: () => renderLibrary(DEFAULT_PROMPTS),
}

export const WithCustomCategories: Story = {
  render: () => {
    const grouped: Record<string, Prompt[]> = {}
    for (const p of DEFAULT_PROMPTS) {
      const key = p.category ?? "Other"
      ;(grouped[key] ??= []).push(p)
    }
    const categories = Object.keys(grouped)
    return (
      <PromptLibrary prompts={DEFAULT_PROMPTS}>
        <PromptLibraryTrigger />
        <PromptLibraryContent>
          <PromptLibrarySearch />
          <PromptLibraryList>
            <PromptLibraryEmpty />
            {categories.map((cat, i) => (
              <Fragment key={cat}>
                <PromptLibraryCategory heading={cat}>
                  {(grouped[cat] ?? []).map((p) => (
                    <PromptLibraryItem key={p.id} prompt={p} />
                  ))}
                </PromptLibraryCategory>
                {i < categories.length - 1 && <PromptLibrarySeparator />}
              </Fragment>
            ))}
          </PromptLibraryList>
          <PromptLibraryFooter>
            <PromptLibraryCreateTrigger />
          </PromptLibraryFooter>
        </PromptLibraryContent>
        <PromptLibraryCreateDialog />
      </PromptLibrary>
    )
  },
}

export const WithCustomPrompts: Story = {
  render: () =>
    renderLibrary([
      ...DEFAULT_PROMPTS,
      {
        id: "custom-tone",
        title: "Friendly Tone",
        description: "Rewrite copy with a friendly tone",
        prompt:
          "Rewrite the following copy in a friendly, casual tone:\n\n[text]",
        category: "Writing",
        isCustom: true,
      },
    ]),
}

export const Empty: Story = {
  render: () => renderLibrary([]),
}
