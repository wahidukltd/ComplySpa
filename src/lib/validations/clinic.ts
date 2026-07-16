import { z } from "zod";

export const createClinicSchema = z.object({
  name: z
    .string()
    .min(1, "Clinic name is required")
    .max(255, "Clinic name must be 255 characters or fewer"),
  address: z
    .string()
    .max(500, "Address must be 500 characters or fewer")
    .optional()
    .or(z.literal("")),
  state: z
    .string()
    .max(2, "Use the 2-letter state abbreviation")
    .optional()
    .or(z.literal("")),
});

export type CreateClinicInput = z.infer<typeof createClinicSchema>;
