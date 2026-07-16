import { z } from "zod";

export const staffMemberSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  role: z
    .enum(["RN", "NP", "PA", "MD", "DO", "esthetician", "MA", "other"])
    .optional(),
  hire_date: z.string().date("Use YYYY-MM-DD format").optional().or(z.literal("")),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  procedures_performed: z.array(z.string()).default([]),
});

export type StaffMemberInput = z.infer<typeof staffMemberSchema>;
