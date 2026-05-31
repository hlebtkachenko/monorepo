import type { Metadata } from "next"
import { BRAND_SUPPORT_EMAIL, Logo } from "@workspace/ui/brand-assets"

import styles from "./sleeping.module.css"

/**
 * In-app "app is asleep" page, authored in the real design system so it can be
 * previewed/iterated while the app is up (e.g. localhost:3030/sleeping).
 *
 * NOTE: this route cannot serve while the env is cold-paused — pausing scales
 * the Fargate task to 0, so Next.js itself is off. The page that actually shows
 * during a pause is the static edge twin at
 * infra/cloudflare-sleeping/public/index.html. Keep the two in visual sync.
 */
export const metadata: Metadata = {
  title: "Asleep",
  robots: { index: false, follow: false },
}

const STATUS_URL = "https://status.afframe.com"

export default function SleepingPage() {
  return (
    <main className={styles.page}>
      <div className={styles.wrap}>
        <Logo
          variant="horizontal"
          tone="mono-light"
          className={styles.brand}
          aria-label="Afframe"
        />

        <div
          className={styles.scene}
          role="img"
          aria-label="A cat curled up asleep"
        >
          <span className={`${styles.z} ${styles.z1}`} aria-hidden>
            z
          </span>
          <span className={`${styles.z} ${styles.z2}`} aria-hidden>
            z
          </span>
          <span className={`${styles.z} ${styles.z3}`} aria-hidden>
            Z
          </span>
          <svg
            className={styles.cat}
            width="240"
            height="170"
            viewBox="0 0 240 170"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden
          >
            <ellipse
              cx="124"
              cy="150"
              rx="96"
              ry="12"
              fill="rgba(0,0,0,0.28)"
            />
            <path
              d="M44 132 C 30 96, 58 64, 100 62 C 150 60, 208 78, 214 116 C 217 134, 200 144, 176 144 L 70 144 C 54 144, 46 140, 44 132 Z"
              fill="#1a3a31"
              stroke="#28dcb1"
              strokeWidth="3"
            />
            <path
              d="M70 142 C 40 142, 30 120, 44 104"
              fill="none"
              stroke="#28dcb1"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <circle
              cx="78"
              cy="108"
              r="34"
              fill="#1f4339"
              stroke="#28dcb1"
              strokeWidth="3"
            />
            <path
              d="M58 84 L 54 62 L 76 78 Z"
              fill="#1f4339"
              stroke="#28dcb1"
              strokeWidth="3"
              strokeLinejoin="round"
            />
            <path
              d="M96 78 L 110 60 L 104 86 Z"
              fill="#1f4339"
              stroke="#28dcb1"
              strokeWidth="3"
              strokeLinejoin="round"
            />
            <path
              d="M62 108 q 9 8 18 0"
              fill="none"
              stroke="#28dcb1"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <circle cx="50" cy="116" r="3" fill="#28dcb1" />
            <path
              d="M48 120 L 30 118 M48 124 L 30 128"
              stroke="#5f8579"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <h1 className={styles.title}>Afframe is asleep</h1>
        <p className={styles.lead}>
          This environment powers down when nobody is using it, to keep things
          lean. It is not an outage. The service comes back automatically the
          next time it is started, and takes a short moment to wake.
        </p>

        <div className={styles.actions}>
          <a className={`${styles.btn} ${styles.btnPrimary}`} href={STATUS_URL}>
            Check status
          </a>
          <a
            className={`${styles.btn} ${styles.btnGhost}`}
            href={`mailto:${BRAND_SUPPORT_EMAIL}`}
          >
            Contact support
          </a>
        </div>

        <p className={styles.foot}>
          Questions?{" "}
          <a href={`mailto:${BRAND_SUPPORT_EMAIL}`}>{BRAND_SUPPORT_EMAIL}</a>
        </p>
      </div>
    </main>
  )
}
