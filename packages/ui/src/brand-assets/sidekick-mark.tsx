import { cn } from "@workspace/ui/lib/utils"

/**
 * Sidekick (AI assistant) brand mark — a rounded-square tile with the
 * accent spark. Fixed artwork colors, like the other logo path modules
 * (not part of the tone system). Size via `className`; defaults to the
 * shared `--icon-size` so it drops into an IconButton `iconNode`.
 */
export function SidekickMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      color="#4f5255"
      aria-hidden
      className={cn("size-[var(--icon-size)] shrink-0", className)}
    >
      <path
        fill="#fff"
        d="M3.403 1.38h9.204c1.118 0 2.023.906 2.023 2.023v9.204a2.023 2.023 0 0 1-2.023 2.023H3.403a2.024 2.024 0 0 1-2.024-2.023V3.403c0-1.117.907-2.023 2.024-2.023"
      />
      <path
        fill="currentColor"
        d="M14.63 3.403v7.184c-.435-.17-.882-.346-1.174-.457-.676-.258-1.234-.85-1.549-1.68-.116-.305-.217-.862-.259-1.184-.13-1.003-.357-3.015-.52-4.013-.053-.317-.523-.317-.575 0-.163.998-.39 3.01-.52 4.013-.046.358-.13.848-.259 1.185-.31.812-.856 1.413-1.55 1.679-.538.206-1.608.633-2.15.831a.282.282 0 0 0 0 .531c.495.18 1.477.564 1.971.742.905.327 1.404.771 1.771 1.68.073.18.176.445.282.716H3.403a2.023 2.023 0 0 1-2.024-2.023V3.403c0-1.117.907-2.023 2.024-2.023h9.204c1.118 0 2.023.906 2.023 2.023m-.995 8.832c.25-.09.623-.232.995-.375v.748a2.023 2.023 0 0 1-2.023 2.022h-1.025c.106-.27.21-.536.283-.716.365-.904.865-1.352 1.77-1.68"
      />
      <path
        fill="#fff"
        d="M5.3 3.05q.27 2.25.63 3.92.48.31 1.29.63-.81.23-1.29.63-.36.44-.63 1.3-.27-.86-.63-1.3-.48-.4-1.3-.63.82-.32 1.3-.63.36-1.67.63-3.92"
      />
    </svg>
  )
}
