"use client"

import * as React from "react"

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
} from "@workspace/ui/components/prompt-library"

const PROMPTS: Prompt[] = [
  {
    id: "code-review",
    title: "Code Review",
    description: "Review code for best practices and bugs",
    prompt:
      "Please review the following code for best practices, potential bugs, and improvements:\n\n[paste code here]",
    category: "Development",
  },
  {
    id: "explain-error",
    title: "Explain Error",
    description: "Plain-language explanation of a stack trace",
    prompt:
      "Explain the following error in plain language and suggest the most likely fix:\n\n[paste error here]",
    category: "Development",
  },
  {
    id: "summarize",
    title: "Summarize",
    description: "Bullet-point summary of a long passage",
    prompt:
      "Summarize the following text in 3-5 bullet points:\n\n[paste text here]",
    category: "Writing",
  },
  {
    id: "friendly-tone",
    title: "Friendly Tone",
    description: "Rewrite copy in a friendly, casual voice",
    prompt: "Rewrite the following copy in a friendly, casual tone:\n\n[text]",
    category: "Writing",
  },
  {
    id: "translate-cs",
    title: "Translate to Czech",
    description: "Translate text into natural Czech",
    prompt: "Translate the following text into natural Czech:\n\n[text]",
    category: "Writing",
  },
  {
    id: "explain-5",
    title: "Explain Like I am 5",
    description: "Simple explanation of a complex topic",
    prompt: "Explain the following topic as if I am 5 years old:\n\n[topic]",
    category: "Education",
  },
]

export function PromptLibraryDemo() {
  return (
    <PromptLibrary prompts={PROMPTS}>
      <PromptLibraryTrigger />
      <PromptLibraryContent>
        <PromptLibrarySearch />
        <PromptLibraryList>
          <PromptLibraryEmpty />
          <PromptLibraryCategory heading="Suggested">
            {PROMPTS.map((p) => (
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
