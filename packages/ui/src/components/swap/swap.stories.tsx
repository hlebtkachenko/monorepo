import type { Meta, StoryObj } from "@storybook/react"
import {
  MoonIcon,
  SunIcon,
  Volume2Icon,
  VolumeOffIcon,
  EyeIcon,
  EyeOffIcon,
} from "lucide-react"
import { Swap, SwapOff, SwapOn } from "./swap"

const meta: Meta<typeof Swap> = {
  title: "Components/Swap",
  component: Swap,
}
export default meta

type Story = StoryObj<typeof Swap>

export const Fade: Story = {
  render: () => (
    <Swap animation="fade" className="size-10 rounded-md border p-2">
      <SwapOff>
        <SunIcon className="size-5" />
      </SwapOff>
      <SwapOn>
        <MoonIcon className="size-5" />
      </SwapOn>
    </Swap>
  ),
}

export const Rotate: Story = {
  render: () => (
    <Swap animation="rotate" className="size-10 rounded-md border p-2">
      <SwapOff>
        <SunIcon className="size-5" />
      </SwapOff>
      <SwapOn>
        <MoonIcon className="size-5" />
      </SwapOn>
    </Swap>
  ),
}

export const Flip: Story = {
  render: () => (
    <Swap animation="flip" className="size-10 rounded-md border p-2">
      <SwapOff>
        <Volume2Icon className="size-5" />
      </SwapOff>
      <SwapOn>
        <VolumeOffIcon className="size-5" />
      </SwapOn>
    </Swap>
  ),
}

export const Scale: Story = {
  render: () => (
    <Swap animation="scale" className="size-10 rounded-md border p-2">
      <SwapOff>
        <EyeIcon className="size-5" />
      </SwapOff>
      <SwapOn>
        <EyeOffIcon className="size-5" />
      </SwapOn>
    </Swap>
  ),
}

export const Disabled: Story = {
  render: () => (
    <Swap animation="fade" disabled className="size-10 rounded-md border p-2">
      <SwapOff>
        <SunIcon className="size-5" />
      </SwapOff>
      <SwapOn>
        <MoonIcon className="size-5" />
      </SwapOn>
    </Swap>
  ),
}

export const ActivationModeClick: Story = {
  render: () => (
    <Swap
      activationMode="click"
      animation="fade"
      className="size-10 rounded-md border p-2"
    >
      <SwapOff>
        <SunIcon className="size-5" />
      </SwapOff>
      <SwapOn>
        <MoonIcon className="size-5" />
      </SwapOn>
    </Swap>
  ),
}

export const ActivationModeHover: Story = {
  render: () => (
    <Swap
      activationMode="hover"
      animation="fade"
      className="size-10 rounded-md border p-2"
    >
      <SwapOff>
        <SunIcon className="size-5" />
      </SwapOff>
      <SwapOn>
        <MoonIcon className="size-5" />
      </SwapOn>
    </Swap>
  ),
}

export const AnimationFade: Story = {
  render: () => (
    <Swap animation="fade" className="size-10 rounded-md border p-2">
      <SwapOff>
        <SunIcon className="size-5" />
      </SwapOff>
      <SwapOn>
        <MoonIcon className="size-5" />
      </SwapOn>
    </Swap>
  ),
}

export const AnimationRotate: Story = {
  render: () => (
    <Swap animation="rotate" className="size-10 rounded-md border p-2">
      <SwapOff>
        <SunIcon className="size-5" />
      </SwapOff>
      <SwapOn>
        <MoonIcon className="size-5" />
      </SwapOn>
    </Swap>
  ),
}

export const AnimationFlip: Story = {
  render: () => (
    <Swap animation="flip" className="size-10 rounded-md border p-2">
      <SwapOff>
        <Volume2Icon className="size-5" />
      </SwapOff>
      <SwapOn>
        <VolumeOffIcon className="size-5" />
      </SwapOn>
    </Swap>
  ),
}

export const AnimationScale: Story = {
  render: () => (
    <Swap animation="scale" className="size-10 rounded-md border p-2">
      <SwapOff>
        <EyeIcon className="size-5" />
      </SwapOff>
      <SwapOn>
        <EyeOffIcon className="size-5" />
      </SwapOn>
    </Swap>
  ),
}
