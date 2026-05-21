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
