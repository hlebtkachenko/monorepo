// Shared render helpers for the creds-free `book` / `extract` plan inspectors. PURE text formatting only.

/** Left-pad every line of `text` by `spaces` blanks. PURE. */
export function indent(text: string, spaces: number): string {
  const pad = " ".repeat(spaces)
  return text
    .split("\n")
    .map((line) => pad + line)
    .join("\n")
}
