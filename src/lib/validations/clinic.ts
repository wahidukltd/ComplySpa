import { z } from "zod";

export const createClinicSchema = z.object({
  name: z
    .string()
    .min(1, "Clinic name is required")
    .max(255, "Clinic name must be 255 characters or fewer"),
  address: z
    .string()
    .max(500, "Address must be 500 characters or fewer")
    .transform(val => val.replace(/<[^>]*>/g, ""))
    .optional()
    .or(z.literal("")),
  state: z
    .string()
    .max(100, "Must be 100 characters or fewer")
    .optional()
    .or(z.literal(""))
    .transform(val => val === "" ? undefined : val),
});

export type CreateClinicInput = z.infer<typeof createClinicSchema>;
