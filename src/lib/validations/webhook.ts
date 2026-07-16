import { z } from "zod";

export const polarWebhookSchema = z.object({
  type: z.string(),
  data: z.object({
    id: z.string(),
    attributes: z.record(z.string(), z.unknown()),
  }),
});

export type PolarWebhookPayload = z.infer<typeof polarWebhookSchema>;
