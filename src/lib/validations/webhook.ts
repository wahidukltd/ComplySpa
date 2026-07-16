import { z } from "zod";

const subscriptionDataSchema = z.object({
  data: z.object({
    id: z.string(),
    attributes: z.object({
      status: z.enum(["active", "canceled", "past_due", "incomplete", "trialing", "unpaid"]).optional(),
      current_period_start: z.string().optional(),
      current_period_end: z.string().optional(),
      cancel_at_period_end: z.boolean().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }).passthrough(),
  }),
});

export const polarWebhookSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("subscription.active"), ...subscriptionDataSchema.shape }),
  z.object({ type: z.literal("subscription.canceled"), ...subscriptionDataSchema.shape }),
  z.object({ type: z.literal("subscription.updated"), ...subscriptionDataSchema.shape }),
  z.object({
    type: z.literal("checkout.created"),
    data: z.object({
      id: z.string(),
      attributes: z.object({}).passthrough(),
    }),
  }),
  z.object({
    type: z.string(),
    data: z.object({
      id: z.string(),
      attributes: z.record(z.string(), z.unknown()),
    }),
  }),
]);

export type PolarWebhookPayload = z.infer<typeof polarWebhookSchema>;
