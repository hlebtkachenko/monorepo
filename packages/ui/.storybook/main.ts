import type { StorybookConfig } from "@storybook/react-vite"

// Heavy addons (a11y, vitest, chromatic) load only when SB_FULL=1 or building.
// In dev, lighter set keeps RAM/CPU down. CI sets SB_FULL=1 to enable all.
const isFullMode =
  process.env.SB_FULL === "1" || process.env.NODE_ENV === "production"

const baseAddons = [
  "@storybook/addon-docs",
  "@storybook/addon-themes",
  "@storybook/addon-links",
]

const heavyAddons = [
  "@storybook/addon-a11y",
  "@chromatic-com/storybook",
  "@storybook/addon-vitest",
]

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  framework: "@storybook/react-vite",
  docs: { autodocs: true },
  addons: isFullMode ? [...baseAddons, ...heavyAddons] : baseAddons,
  async viteFinal(viteConfig) {
    // Lazy-compile stories on demand instead of all on startup
    viteConfig.optimizeDeps = {
      ...viteConfig.optimizeDeps,
      esbuildOptions: {
        ...viteConfig.optimizeDeps?.esbuildOptions,
      },
    }
    viteConfig.server = {
      ...viteConfig.server,
      warmup: { clientFiles: [] },
    }
    return viteConfig
  },
}

export default config
