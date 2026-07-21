import { z } from "zod";

export const clinicProfileSchema = z.object({
  name: z.string().min(1, "Clinic name is required").max(255, "Clinic name must be 255 characters or fewer"),
  address: z.string().max(500, "Address must be 500 characters or fewer").optional().or(z.literal("")),
  state: z.string().max(100, "Must be 100 characters or fewer").optional().or(z.literal("")),
});

export const alertRecipientSchema = z.object({
  email: z.string().email("Valid email required").max(255, "Email must be 255 characters or fewer"),
});

export const customCredentialTypeSchema = z.object({
  name: z.string().min(1, "Name is required").max(255, "Name must be 255 characters or fewer"),
  category: z.enum(["license", "training", "insurance", "agreement"]),
  default_renewal_cycle_days: z.number().int().min(1, "Must be at least 1 day").max(3650, "Must be 3650 days or fewer").optional(),
});

export const inviteUserSchema = z.object({
  email: z.string().email("Valid email required").max(255, "Email must be 255 characters or fewer"),
  role: z.enum(["manager", "viewer"]),
});

export type ClinicProfileInput = z.infer<typeof clinicProfileSchema>;
export type AlertRecipientInput = z.infer<typeof alertRecipientSchema>;
export type CustomCredentialTypeInput = z.infer<typeof customCredentialTypeSchema>;
export type InviteUserInput = z.infer<typeof inviteUserSchema>;
