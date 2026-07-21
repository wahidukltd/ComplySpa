import { z } from "zod";

export const findingStatusSchema = z.enum(["pass", "fail", "stale", "manual_attest"]);

export const remediationStatusSchema = z.enum(["open", "in_progress", "closed"]);

export const updateFindingSchema = z.object({
  status: findingStatusSchema.optional(),
  notes: z.string().max(2000).nullable().optional(),
  remediation_due_date: z.string().nullable().optional(),
  remediation_status: remediationStatusSchema.optional(),
});

export const completeAuditSchema = z.object({
  runId: z.string().uuid(),
});

export type FindingStatusInput = z.infer<typeof findingStatusSchema>;
export type RemediationStatusInput = z.infer<typeof remediationStatusSchema>;
export type UpdateFindingInput = z.infer<typeof updateFindingSchema>;