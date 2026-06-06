import { z } from "zod"

import "./zod-openapi"

/**
 * `POST /v1/feedback` — partner feedback submission.
 *
 * Server-side handling: send email via Resend to
 * `support+feedback@afframe.com` (Gmail-style sub-addressing routes to
 * the support inbox with an auto-applied label) AND create a Linear
 * issue in the Afframe project tagged by type. The api never persists
 * raw feedback locally — Linear is the system of record.
 */

export const FeedbackTypeSchema = z
  .enum(["bug", "request", "issue", "question"])
  .openapi({
    description:
      "Feedback category. `bug` = something broken; `request` = new " +
      "feature ask; `issue` = process / UX / docs problem; `question` = " +
      "support question that didn't fit the FAQ.",
    example: "bug",
  })
export type FeedbackType = z.infer<typeof FeedbackTypeSchema>

/**
 * Optional, best-effort capture context. Sent by in-app reporters (the
 * right-click bug dialog) to enrich the Linear issue; omitted by public
 * SDK/partner callers. Every field is optional — a bare `{type, message}`
 * submission stays valid. The server folds whatever is present into the
 * Linear description; nothing here is trusted for auth or scoping.
 */
const RectSchema = z
  .object({
    top: z.number(),
    left: z.number(),
    width: z.number(),
    height: z.number(),
  })
  .nullable()

export const FeedbackContextSchema = z
  .object({
    page: z
      .object({
        url: z.string().max(2048),
        pathname: z.string().max(512),
        title: z.string().max(500).nullable().optional(),
        locale: z.string().max(16).nullable().optional(),
        theme: z.enum(["light", "dark", "system"]).nullable().optional(),
        referrer: z.string().max(2048).nullable().optional(),
      })
      .optional()
      .openapi({ description: "Page the report was filed from." }),
    scope: z
      .object({
        org_slug: z.string().max(64).optional(),
        reporter_id: z.string().max(64).optional(),
        reporter_email: z.string().max(320).optional(),
      })
      .optional()
      .openapi({
        description:
          "App scope + server-resolved reporter identity. Advisory only — " +
          "never used for authorization.",
      }),
    element: z
      .object({
        tag: z.string().max(64),
        data_slot: z.string().max(128).nullable().optional(),
        role: z.string().max(64).nullable().optional(),
        id: z.string().max(128).nullable().optional(),
        classes: z.string().max(500).nullable().optional(),
        text: z.string().max(1000).optional(),
        dom_path: z.string().max(2000).optional(),
        bounding_rect: RectSchema.optional(),
      })
      .optional()
      .openapi({ description: "Right-clicked element descriptor." }),
    selection: z
      .object({
        text: z.string().max(4000).nullable().optional(),
        html: z.string().max(4000).nullable().optional(),
        rect: RectSchema.optional(),
      })
      .optional()
      .openapi({ description: "Active text selection, if any." }),
    surrounding: z
      .object({
        nearest_heading: z.string().max(300).nullable().optional(),
        inferred_block: z.string().max(128).nullable().optional(),
        nearby_text: z.string().max(2000).optional(),
      })
      .optional()
      .openapi({ description: "Nearby DOM text for locating the report." }),
    viewport: z
      .object({
        width: z.number().int().min(0).max(20000),
        height: z.number().int().min(0).max(20000),
        scroll_y: z.number().int().min(0).max(1000000),
        device_pixel_ratio: z.number().min(0).max(8),
      })
      .optional()
      .openapi({ description: "Viewport dimensions at capture time." }),
    client: z
      .object({
        user_agent: z.string().max(800),
        platform: z.string().max(128).nullable().optional(),
        language: z.string().max(32).nullable().optional(),
        timezone: z.string().max(64).nullable().optional(),
        online: z.boolean().optional(),
        prefers_dark: z.boolean().optional(),
      })
      .optional()
      .openapi({ description: "Reporter's browser/runtime environment." }),
  })
  .openapi({
    description:
      "Optional in-app capture context. Public callers omit it; the " +
      "in-app bug reporter attaches it to enrich the Linear issue.",
  })
export type FeedbackContext = z.infer<typeof FeedbackContextSchema>

export const CreateFeedbackRequestSchema = z
  .object({
    type: FeedbackTypeSchema,
    message: z
      .string()
      .min(1)
      .max(4000)
      .openapi({
        description:
          "Free-form feedback text. 1–4000 characters. Markdown allowed " +
          "but not rendered — the Linear issue treats this as plain text.",
        example:
          "The /v1/organization endpoint returned a 500 when my API key " +
          "was created in the last 60 seconds. Retried after a minute and " +
          "it worked.",
      }),
    email: z
      .email()
      .max(254)
      .optional()
      .openapi({
        description:
          "Optional contact email. If provided, support will reply " +
          "here; otherwise the response is filed without a return path. " +
          "Already-authenticated keys carry an org contact so this is " +
          "purely for users who want a direct reply.",
        example: "dev@partner.example",
      }),
    context: FeedbackContextSchema.optional().openapi({
      description:
        "Optional in-app capture context (page, element, viewport, " +
        "client). Public callers omit it; the in-app reporter attaches " +
        "it. Folded into the Linear issue when present.",
    }),
  })
  .openapi({
    description:
      "Partner feedback submission. Idempotency is not enforced — " +
      "duplicate submissions create duplicate Linear issues. Clients " +
      "should rate-limit themselves to one submission per minute.",
  })
export type CreateFeedbackRequest = z.infer<typeof CreateFeedbackRequestSchema>

export const CreateFeedbackResponseSchema = z
  .object({
    received: z.literal(true).openapi({
      description:
        "Always `true` on a 2xx response. Confirms the api accepted the " +
        "submission for downstream dispatch (email + Linear issue).",
    }),
    referenceId: z.string().openapi({
      description:
        "Opaque submission reference. Quote this in any follow-up email — " +
        "it links the support reply back to the Linear issue.",
      example: "fb_2ZdAk5x",
    }),
  })
  .openapi({
    description:
      "Confirmation that feedback was accepted. Acceptance does NOT " +
      "guarantee a reply — `question` submissions get one, the others " +
      "are reviewed without acknowledgement unless an email is provided.",
  })
export type CreateFeedbackResponse = z.infer<
  typeof CreateFeedbackResponseSchema
>
