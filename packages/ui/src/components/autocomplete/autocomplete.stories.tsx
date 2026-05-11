import type { Meta, StoryObj } from "@storybook/react"
import { expect, userEvent, within } from "storybook/test"
import { SearchIcon } from "lucide-react"
import {
  Autocomplete,
  AutocompleteEmpty,
  AutocompleteGroup,
  AutocompleteGroupLabel,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
  AutocompletePopup,
  AutocompleteSeparator,
} from "./autocomplete"

const meta: Meta<typeof Autocomplete> = {
  title: "Components/Autocomplete",
  component: Autocomplete,
}
export default meta

type Story = StoryObj<typeof Autocomplete>

const FRAMEWORKS = [
  "Next.js",
  "Remix",
  "Astro",
  "Nuxt",
  "SvelteKit",
  "Gatsby",
  "Angular",
  "SolidStart",
]

export const Default: Story = {
  render: () => (
    <div className="w-full max-w-sm">
      <Autocomplete items={FRAMEWORKS} mode="list" openOnInputClick>
        <AutocompleteInput placeholder="Search frameworks..." showClear />
        <AutocompletePopup>
          <AutocompleteList>
            {(fw: string) => (
              <AutocompleteItem key={fw} value={fw}>
                {fw}
              </AutocompleteItem>
            )}
          </AutocompleteList>
          <AutocompleteEmpty>No frameworks found.</AutocompleteEmpty>
        </AutocompletePopup>
      </Autocomplete>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByPlaceholderText("Search frameworks...")
    await userEvent.click(input)
    await userEvent.type(input, "Rem")
    const body = within(document.body)
    await expect(await body.findByText("Remix")).toBeInTheDocument()
  },
}

export const WithTrigger: Story = {
  render: () => (
    <div className="w-full max-w-sm">
      <Autocomplete items={FRAMEWORKS} mode="list" openOnInputClick>
        <AutocompleteInput placeholder="Pick a framework..." showTrigger />
        <AutocompletePopup>
          <AutocompleteList>
            {(fw: string) => (
              <AutocompleteItem key={fw} value={fw}>
                {fw}
              </AutocompleteItem>
            )}
          </AutocompleteList>
        </AutocompletePopup>
      </Autocomplete>
    </div>
  ),
}

export const WithStartAddon: Story = {
  render: () => (
    <div className="w-full max-w-sm">
      <Autocomplete items={FRAMEWORKS} mode="list" openOnInputClick>
        <AutocompleteInput
          placeholder="Search..."
          showClear
          startAddon={<SearchIcon />}
        />
        <AutocompletePopup>
          <AutocompleteList>
            {(fw: string) => (
              <AutocompleteItem key={fw} value={fw}>
                {fw}
              </AutocompleteItem>
            )}
          </AutocompleteList>
        </AutocompletePopup>
      </Autocomplete>
    </div>
  ),
}

export const Disabled: Story = {
  render: () => (
    <div className="w-full max-w-sm">
      <Autocomplete items={FRAMEWORKS} mode="list" disabled>
        <AutocompleteInput placeholder="Disabled" />
        <AutocompletePopup>
          <AutocompleteList>
            {(fw: string) => (
              <AutocompleteItem key={fw} value={fw}>
                {fw}
              </AutocompleteItem>
            )}
          </AutocompleteList>
        </AutocompletePopup>
      </Autocomplete>
    </div>
  ),
}

export const Grouped: Story = {
  render: () => (
    <div className="w-full max-w-sm">
      <Autocomplete mode="list" openOnInputClick>
        <AutocompleteInput placeholder="Search..." showClear />
        <AutocompletePopup>
          <AutocompleteList>
            <AutocompleteGroup>
              <AutocompleteGroupLabel>Meta</AutocompleteGroupLabel>
              <AutocompleteItem value="Next.js">Next.js</AutocompleteItem>
              <AutocompleteItem value="Remix">Remix</AutocompleteItem>
            </AutocompleteGroup>
            <AutocompleteSeparator />
            <AutocompleteGroup>
              <AutocompleteGroupLabel>Other</AutocompleteGroupLabel>
              <AutocompleteItem value="Astro">Astro</AutocompleteItem>
              <AutocompleteItem value="Nuxt">Nuxt</AutocompleteItem>
            </AutocompleteGroup>
          </AutocompleteList>
        </AutocompletePopup>
      </Autocomplete>
    </div>
  ),
}
