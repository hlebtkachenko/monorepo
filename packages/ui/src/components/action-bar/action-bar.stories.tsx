import type { Meta, StoryObj } from "@storybook/react"
import { useState } from "react"
import {
  ActionBar,
  ActionBarClose,
  ActionBarGroup,
  ActionBarItem,
  ActionBarSelection,
  ActionBarSeparator,
} from "./action-bar"

const meta: Meta<typeof ActionBar> = {
  title: "Components/ActionBar",
  component: ActionBar,
}
export default meta

type Story = StoryObj<typeof ActionBar>

export const Default: Story = {
  render: () => {
    const [open, setOpen] = useState(true)
    return (
      <div className="relative h-40">
        <button onClick={() => setOpen(true)} className="text-sm underline">
          Show action bar
        </button>
        <ActionBar open={open} onOpenChange={setOpen}>
          <ActionBarGroup>
            <ActionBarSelection>
              3 selected
              <ActionBarSeparator />
            </ActionBarSelection>
            <ActionBarItem onSelect={() => setOpen(false)}>Copy</ActionBarItem>
            <ActionBarItem onSelect={() => setOpen(false)}>Edit</ActionBarItem>
            <ActionBarSeparator />
            <ActionBarItem
              variant="destructive"
              onSelect={() => setOpen(false)}
            >
              Delete
            </ActionBarItem>
            <ActionBarSeparator />
            <ActionBarClose>✕</ActionBarClose>
          </ActionBarGroup>
        </ActionBar>
      </div>
    )
  },
}

export const Vertical: Story = {
  render: () => {
    const [open, setOpen] = useState(true)
    return (
      <div className="relative h-64">
        <button onClick={() => setOpen(true)} className="text-sm underline">
          Show vertical action bar
        </button>
        <ActionBar open={open} onOpenChange={setOpen} orientation="vertical">
          <ActionBarGroup>
            <ActionBarItem onSelect={() => setOpen(false)}>Copy</ActionBarItem>
            <ActionBarItem onSelect={() => setOpen(false)}>Edit</ActionBarItem>
            <ActionBarSeparator />
            <ActionBarItem
              variant="destructive"
              onSelect={() => setOpen(false)}
            >
              Delete
            </ActionBarItem>
          </ActionBarGroup>
        </ActionBar>
      </div>
    )
  },
}

export const TopAligned: Story = {
  render: () => {
    const [open, setOpen] = useState(true)
    return (
      <div className="relative h-40">
        <button onClick={() => setOpen(true)} className="text-sm underline">
          Show top action bar
        </button>
        <ActionBar open={open} onOpenChange={setOpen} side="top">
          <ActionBarGroup>
            <ActionBarSelection>2 selected</ActionBarSelection>
            <ActionBarItem onSelect={() => setOpen(false)}>
              Archive
            </ActionBarItem>
            <ActionBarSeparator />
            <ActionBarClose>✕</ActionBarClose>
          </ActionBarGroup>
        </ActionBar>
      </div>
    )
  },
}

export const AlignStart: Story = {
  render: () => {
    const [open, setOpen] = useState(true)
    return (
      <div className="relative h-40">
        <button onClick={() => setOpen(true)} className="text-sm underline">
          Show action bar
        </button>
        <ActionBar open={open} onOpenChange={setOpen} align="start">
          <ActionBarGroup>
            <ActionBarItem onSelect={() => setOpen(false)}>Copy</ActionBarItem>
            <ActionBarItem onSelect={() => setOpen(false)}>Edit</ActionBarItem>
            <ActionBarClose>✕</ActionBarClose>
          </ActionBarGroup>
        </ActionBar>
      </div>
    )
  },
}

export const AlignCenter: Story = {
  render: () => {
    const [open, setOpen] = useState(true)
    return (
      <div className="relative h-40">
        <button onClick={() => setOpen(true)} className="text-sm underline">
          Show action bar
        </button>
        <ActionBar open={open} onOpenChange={setOpen} align="center">
          <ActionBarGroup>
            <ActionBarItem onSelect={() => setOpen(false)}>Copy</ActionBarItem>
            <ActionBarItem onSelect={() => setOpen(false)}>Edit</ActionBarItem>
            <ActionBarClose>✕</ActionBarClose>
          </ActionBarGroup>
        </ActionBar>
      </div>
    )
  },
}

export const AlignEnd: Story = {
  render: () => {
    const [open, setOpen] = useState(true)
    return (
      <div className="relative h-40">
        <button onClick={() => setOpen(true)} className="text-sm underline">
          Show action bar
        </button>
        <ActionBar open={open} onOpenChange={setOpen} align="end">
          <ActionBarGroup>
            <ActionBarItem onSelect={() => setOpen(false)}>Copy</ActionBarItem>
            <ActionBarItem onSelect={() => setOpen(false)}>Edit</ActionBarItem>
            <ActionBarClose>✕</ActionBarClose>
          </ActionBarGroup>
        </ActionBar>
      </div>
    )
  },
}

export const SideTop: Story = {
  render: () => {
    const [open, setOpen] = useState(true)
    return (
      <div className="relative h-40">
        <button onClick={() => setOpen(true)} className="text-sm underline">
          Show action bar
        </button>
        <ActionBar open={open} onOpenChange={setOpen} side="top">
          <ActionBarGroup>
            <ActionBarItem onSelect={() => setOpen(false)}>Copy</ActionBarItem>
            <ActionBarItem onSelect={() => setOpen(false)}>Edit</ActionBarItem>
            <ActionBarClose>✕</ActionBarClose>
          </ActionBarGroup>
        </ActionBar>
      </div>
    )
  },
}

export const SideBottom: Story = {
  render: () => {
    const [open, setOpen] = useState(true)
    return (
      <div className="relative h-40">
        <button onClick={() => setOpen(true)} className="text-sm underline">
          Show action bar
        </button>
        <ActionBar open={open} onOpenChange={setOpen} side="bottom">
          <ActionBarGroup>
            <ActionBarItem onSelect={() => setOpen(false)}>Copy</ActionBarItem>
            <ActionBarItem onSelect={() => setOpen(false)}>Edit</ActionBarItem>
            <ActionBarClose>✕</ActionBarClose>
          </ActionBarGroup>
        </ActionBar>
      </div>
    )
  },
}

export const Disabled: Story = {
  render: () => {
    const [open, setOpen] = useState(true)
    return (
      <div className="relative h-40">
        <button onClick={() => setOpen(true)} className="text-sm underline">
          Show action bar
        </button>
        <ActionBar open={open} onOpenChange={setOpen}>
          <ActionBarGroup>
            <ActionBarItem disabled onSelect={() => setOpen(false)}>
              Copy
            </ActionBarItem>
            <ActionBarItem disabled onSelect={() => setOpen(false)}>
              Edit
            </ActionBarItem>
            <ActionBarClose>✕</ActionBarClose>
          </ActionBarGroup>
        </ActionBar>
      </div>
    )
  },
}
