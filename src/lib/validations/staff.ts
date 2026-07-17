import { z } from "zod";

export const staffMemberSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  role: z
    .enum(["RN", "NP", "PA", "MD", "DO", "esthetician", "MA", "other"])
    .optional(),
  hire_date: z.string().date("Use YYYY-MM-DD format").optional().or(z.literal("")),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
   procedures_performed: z.array(z.string().max(200)).max(50).default([]),
});

export type StaffMemberInput = z.input<typeof staffMemberSchema>;

export const credentialSchema = z.object({
  staff_member_id: z.string().uuid("Invalid staff member"),
  credential_type_id: z.string().uuid("Select a credential type"),
  license_number: z.string().max(100).optional().or(z.literal("")),
  state: z
    .string()
    .max(100, "Must be 100 characters or fewer")
    .optional()
    .or(z.literal("")),
  issue_date: z.string().date("Use YYYY-MM-DD format").optional().or(z.literal("")),
  expiration_date: z.string().date("Use YYYY-MM-DD format").optional().or(z.literal("")),
  verification_url: z.string().url("Must be a valid URL").refine((u) => u.startsWith("https://") || u.startsWith("http://"), { message: "Only http(s) URLs are allowed" }).optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

export type CredentialInput = z.infer<typeof credentialSchema>;
