import { z } from "zod";

export const clinicProfileSchema = z.object({
  name: z.string().min(1, "Clinic name is required").max(255, "Clinic name must be 255 characters or fewer"),
  address: z.string().max(500, "Address must be 500 characters or fewer").optional().or(z.literal("")),
  state: z.string().max(100, "Must be 100 characters or fewer").optional().or(z.literal("")),
});

// Emails are canonicalized (trim + lowercase) at the boundary so the DB
// unique indexes (case-insensitive on alert_recipients, normalized-pending on
// users) and the delivery pipeline see one canonical form.
export const alertRecipientSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Valid email required")
    .max(255, "Email must be 255 characters or fewer"),
});

// Single custom credential type schema — used by both the Settings add form
// and the credential form's inline custom-type dialog (plan §4.7).
export const customCredentialTypeSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255, "Name must be 255 characters or fewer"),
  category: z.enum(["license", "training", "insurance", "agreement"]),
  renewal_days: z
    .number()
    .int("Must be a whole number of days")
    .min(1, "Must be at least 1 day")
    .max(3650, "Must be 3650 days or fewer")
    .optional(),
});

export const inviteUserSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Valid email required")
    .max(255, "Email must be 255 characters or fewer"),
  role: z.enum(["manager", "viewer"]),
});

export type ClinicProfileInput = z.infer<typeof clinicProfileSchema>;
export type AlertRecipientInput = z.infer<typeof alertRecipientSchema>;
export type CustomCredentialTypeInput = z.infer<typeof customCredentialTypeSchema>;
export type InviteUserInput = z.infer<typeof inviteUserSchema>;
