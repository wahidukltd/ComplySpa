import { z } from "zod";
import { roleNameSchema } from "@/lib/utils/roles";

export const staffMemberSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  // Open role values (057): custom clinic roles are legal. Format is
  // validated here; template existence is enforced by the staff actions
  // (requireTemplate) and the enforce_staff_role_template DB trigger.
  role: roleNameSchema.optional(),
  hire_date: z.string().date("Use YYYY-MM-DD format").optional().or(z.literal("")),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  location: z.string().max(255).optional().or(z.literal("")),
  department: z.string().max(255).optional().or(z.literal("")),
  manager: z.string().max(255).optional().or(z.literal("")),
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
  verification_url: z.string().refine((u) => {
    if (u === "") return true;
    try {
      const url = new URL(u);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  }, { message: "Must be a valid http(s) URL" }).optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

export type CredentialInput = z.infer<typeof credentialSchema>;

// Renewal is an in-place dates update of the SAME credential (owner decision
// 2026-08-04): identity fields (staff, type) are never accepted from the client
// — the server derives them from the existing record, so a renewal can never
// mutate the record into a different credential.
export const renewalSchema = credentialSchema.omit({
  staff_member_id: true,
  credential_type_id: true,
});

export type RenewalInput = z.infer<typeof renewalSchema>;

export const wizardCredentialSchema = z
  .object({
    credential_type_id: z.string().uuid(),
    license_number: z.string().max(100).optional().or(z.literal("")),
    state: z.string().max(100).optional().or(z.literal("")),
    issue_date: z.string().date("Use YYYY-MM-DD format").optional().or(z.literal("")),
    expiration_date: z.string().date("Use YYYY-MM-DD format").optional().or(z.literal("")),
  })
  // Truthful dates: an expiration before the issue date is nonsense data the
  // wizard should never persist (getCredentialStatus only looks at
  // expiration — a reversed pair would read as "expired" with an impossible
  // history). The client mirrors this via rowDateError; this is
  // defense-in-depth for crafted requests.
  .refine(
    (c) => !c.issue_date || !c.expiration_date || c.expiration_date >= c.issue_date,
    { message: "Expiration must be on or after the issue date.", path: ["expiration_date"] },
  );

export type WizardCredentialInput = z.input<typeof wizardCredentialSchema>;

export const addStaffWithCredentialsSchema = staffMemberSchema.extend({
  credentials: z
    .array(wizardCredentialSchema)
    .default([])
    .refine(
      (creds) => new Set(creds.map((c) => c.credential_type_id)).size === creds.length,
      { message: "Duplicate credential types are not allowed." },
    ),
});

export type AddStaffWithCredentialsInput = z.input<typeof addStaffWithCredentialsSchema>;

/** Step-1 fields of the staff wizard — the exact server constraints, enforced
 * client-side so Next never advances past an invalid form and server field
 * errors never land on an invisible step. */
export const staffStep1Schema = staffMemberSchema.pick({
  name: true,
  email: true,
  phone: true,
  location: true,
  department: true,
  hire_date: true,
  manager: true,
});

export type StaffStep1Values = z.input<typeof staffStep1Schema>;
