// Side-effect import provides TypeScript module augmentation for jest-dom
// matchers; explicit expect.extend(matchers) registers them at runtime —
// the side-effect alone doesn't reliably register against Vitest 4.1.x.
import "@testing-library/jest-dom/vitest"
import * as matchers from "@testing-library/jest-dom/matchers"
import { expect } from "vitest"

expect.extend(matchers)

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

global.IntersectionObserver = class IntersectionObserver {
  root = null
  rootMargin = ""
  thresholds = []
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
} as unknown as typeof globalThis.IntersectionObserver

Element.prototype.scrollIntoView = () => {}
Element.prototype.hasPointerCapture = () => false
Element.prototype.setPointerCapture = () => {}
Element.prototype.releasePointerCapture = () => {}

// input-otp polls elementFromPoint after mount; stub to avoid unhandled errors
// in jsdom where the method is not implemented.
document.elementFromPoint = () => null

// jsdom does not reliably provide Web Storage across vitest pools (Node 24's
// experimental localStorage is gated behind --localstorage-file), so components
// that read it on mount (e.g. the icon-pack provider) throw. Provide a simple
// in-memory stub for both storages.
function createStorageStub(): Storage {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => void store.delete(key),
    setItem: (key: string, value: string) => void store.set(key, String(value)),
  } as Storage
}

for (const name of ["localStorage", "sessionStorage"] as const) {
  if (!window[name]) {
    Object.defineProperty(window, name, {
      configurable: true,
      writable: true,
      value: createStorageStub(),
    })
  }
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

// Provide an in-memory Storage when the environment leaves window.localStorage
// undefined (Node 24's experimental `localStorage` global shadows jsdom's
// without `--localstorage-file`), which otherwise breaks any component that
// reads a persisted theme on mount. Guarded: fill only when one is missing.
function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key)
    },
    setItem: (key: string, value: string) => {
      store.set(key, String(value))
    },
  }
}

for (const name of ["localStorage", "sessionStorage"] as const) {
  let usable = false
  try {
    usable =
      typeof (window as unknown as Record<string, Storage>)[name]?.getItem ===
      "function"
  } catch {
    usable = false
  }
  if (!usable) {
    Object.defineProperty(window, name, {
      configurable: true,
      writable: true,
      value: createMemoryStorage(),
    })
  }
}
