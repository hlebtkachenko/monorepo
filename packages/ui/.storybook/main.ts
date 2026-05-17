import type { StorybookConfig } from "@storybook/react-vite"

// Heavy addons (a11y, vitest, chromatic) load only when SB_FULL=1 or building.
// In dev, lighter set keeps RAM/CPU down. CI sets SB_FULL=1 to enable all.
// SB_FULL is a runtime override, not a build-cache input — intentionally absent from turbo.json.
// eslint-disable-next-line turbo/no-undeclared-env-vars
const sbFull = process.env.SB_FULL
const isFullMode = sbFull === "1" || process.env.NODE_ENV === "production"

const baseAddons = [
  "@storybook/addon-docs",
  "@storybook/addon-themes",
  "@storybook/addon-links",
  "@storybook/addon-designs",
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
