// Next.js client instrumentation: catch the errors that never reach a React boundary —
// global `error` events and unhandled promise rejections (the user-invisible ones).
import { reportClientError } from "./app/_lib/report-error"

if (typeof window !== "undefined") {
  window.addEventListener("error", (e) => {
    reportClientError(e.error ?? e.message)
  })
  window.addEventListener("unhandledrejection", (e) => {
    reportClientError(e.reason)
  })
}
