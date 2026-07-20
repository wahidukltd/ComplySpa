"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import * as Sentry from "@sentry/nextjs";
import { CHECKLIST_ITEMS } from "@/lib/audit/checklist";
import { autoFillAll } from "@/lib/audit/auto-fill";
import { calculateReadinessScore } from "@/lib/audit/readiness";
import type { FindingStatus, ChecklistItemId } from "@/lib/audit/checklist";

type UserEmailRef = { email: string } | null;

export async function createAuditRun(): Promise<{
  runId: string | null;
  error: string | null;
}> {
  const { userId } = await auth();
  if (!userId) return { runId: null, error: "Unauthorized" };

  const supabase = await createClient();

  const { data: user } = await supabase
    .from("users")
    .select("id, clinic_id, role")
    .eq("clerk_user_id", userId)
    .single();

  if (!user) return { runId: null, error: "User not found" };
  if (user.role === "viewer") return { runId: null, error: "Viewers cannot create audits" };

  const { data: clinic } = await supabase
    .from("clinics")
    .select("plan")
    .eq("id", user.clinic_id)
    .single();

  if (!clinic) return { runId: null, error: "Clinic not found" };
  const AUDIT_ELIGIBLE_PLANS = ["trial", "practice", "multi_location"];
  if (!AUDIT_ELIGIBLE_PLANS.includes(clinic.plan)) {
    return {
      runId: null,
      error: "Your plan does not include the inspection-readiness engine. Upgrade to Practice or higher.",
    };
  }

  const { data: run, error: runErr } = await supabase
    .from("audit_runs")
    .insert({
      clinic_id: user.clinic_id,
      run_type: "on_demand",
      status: "in_progress",
      created_by_user_id: user.id,
    })
    .select("id")
    .single();

  if (runErr || !run) {
    Sentry.captureException(runErr ?? new Error("No run returned"));
    return { runId: null, error: "Failed to create audit run" };
  }

  const autoFillResults = await autoFillAll(user.clinic_id);

  const findings = CHECKLIST_ITEMS.map((item) => {
    const autoResult = autoFillResults.get(item.id);
    let status: FindingStatus;
    let notes: string | null;
    let autoFilled: boolean;

    if (item.autoFill === false) {
      status = "manual_attest";
      notes = "Requires manual confirmation.";
      autoFilled = false;
    } else {
      if (autoResult) {
        status = autoResult.status;
        notes = autoResult.notes;
        autoFilled = true;
      } else {
        status = "manual_attest";
        notes = null;
        autoFilled = false;
      }
    }

    return {
      audit_run_id: run.id,
      checklist_item: item.id,
      status,
      auto_filled: autoFilled,
      notes,
    };
  });

  const { error: insertErr } = await supabase
    .from("audit_findings")
    .insert(findings);

  if (insertErr) {
    Sentry.captureException(insertErr);
    return { runId: null, error: "Failed to create audit findings" };
  }

  revalidatePath("/dashboard/audit");
  return { runId: run.id, error: null };
}

export async function updateFinding(
  findingId: string,
  updates: {
    status?: FindingStatus;
    notes?: string;
    remediation_due_date?: string | null;
    remediation_status?: "open" | "in_progress" | "closed";
  },
): Promise<{ success: boolean; error: string | null }> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const supabase = await createClient();

  const { data: user } = await supabase
    .from("users")
    .select("role, clinic_id")
    .eq("clerk_user_id", userId)
    .single();

  if (!user || user.role === "viewer") return { success: false, error: "Insufficient permissions" };

  const { data: finding } = await supabase
    .from("audit_findings")
    .select("id, audit_run_id, audit_runs!inner(clinic_id)")
    .eq("id", findingId)
    .eq("audit_runs.clinic_id", user.clinic_id)
    .maybeSingle();

  if (!finding) return { success: false, error: "Finding not found" };

  const { data: run } = await supabase
    .from("audit_runs")
    .select("status")
    .eq("id", finding.audit_run_id)
    .maybeSingle();

  if (!run || run.status !== "in_progress") {
    return { success: false, error: "Cannot update findings on a completed audit" };
  }

  const payload: {
    status?: FindingStatus;
    notes?: string | null;
    remediation_due_date?: string | null;
    remediation_status?: string | null;
    remediation_closed_at?: string;
  } = {};
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.notes !== undefined) payload.notes = updates.notes;
  if (updates.remediation_due_date !== undefined) payload.remediation_due_date = updates.remediation_due_date;
  if (updates.remediation_status !== undefined) payload.remediation_status = updates.remediation_status;

  if (updates.remediation_status === "closed") {
    payload.remediation_closed_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("audit_findings")
    .update(payload)
    .eq("id", findingId);

  if (error) {
    Sentry.captureException(error);
    return { success: false, error: "Failed to update finding" };
  }

  revalidatePath("/dashboard/audit");
  return { success: true, error: null };
}

export async function completeAudit(
  runId: string,
): Promise<{ score: number | null; error: string | null }> {
  const { userId } = await auth();
  if (!userId) return { score: null, error: "Unauthorized" };

  const supabase = await createClient();

  const { data: user } = await supabase
    .from("users")
    .select("role, clinic_id")
    .eq("clerk_user_id", userId)
    .single();

  if (!user || user.role === "viewer") return { score: null, error: "Insufficient permissions" };

  const { data: run } = await supabase
    .from("audit_runs")
    .select("id, status")
    .eq("id", runId)
    .eq("clinic_id", user.clinic_id)
    .maybeSingle();

  if (!run) return { score: null, error: "Audit not found" };
  if (run.status === "completed") return { score: null, error: "Audit already completed" };

  const { data: findings } = await supabase
    .from("audit_findings")
    .select("status")
    .eq("audit_run_id", runId);

  if (!findings) return { score: null, error: "No findings found" };

  const score = calculateReadinessScore(
    findings as Array<{ status: FindingStatus }>,
  );

  const { error } = await supabase
    .from("audit_runs")
    .update({
      status: "completed",
      readiness_score: score,
      completed_at: new Date().toISOString(),
    })
    .eq("id", runId);

  if (error) {
    Sentry.captureException(error);
    return { score: null, error: "Failed to complete audit" };
  }

  revalidatePath("/dashboard/audit");
  return { score, error: null };
}

export async function getAuditHistory(): Promise<{
  audits: Array<{
    id: string;
    runType: string;
    status: string;
    readinessScore: number | null;
    startedAt: string;
    completedAt: string | null;
    createdBy: string;
  }>;
  error: string | null;
}> {
  const { userId } = await auth();
  if (!userId) return { audits: [], error: "Unauthorized" };

  const supabase = await createClient();

  const { data: user } = await supabase
    .from("users")
    .select("clinic_id")
    .eq("clerk_user_id", userId)
    .single();

  if (!user) return { audits: [], error: "User not found" };

  const { data } = await supabase
    .from("audit_runs")
    .select(`
      id, run_type, status, readiness_score, started_at, completed_at,
      users!audit_runs_created_by_user_id_fkey ( email )
    `)
    .eq("clinic_id", user.clinic_id)
    .order("started_at", { ascending: false })
    .limit(50);

  return {
    audits: (data ?? []).map((a) => ({
      id: a.id,
      runType: a.run_type,
      status: a.status,
      readinessScore: a.readiness_score,
      startedAt: a.started_at,
      completedAt: a.completed_at,
      createdBy: ((a.users as UserEmailRef)?.email) ?? "Unknown",
    })),
    error: null,
  };
}

export async function getAuditRun(runId: string): Promise<{
  run: {
    id: string;
    runType: string;
    status: string;
    readinessScore: number | null;
    startedAt: string;
    completedAt: string | null;
    createdBy: string;
  } | null;
  findings: Array<{
    id: string;
    checklistItem: ChecklistItemId;
    status: FindingStatus;
    autoFilled: boolean;
    notes: string | null;
    remediationDueDate: string | null;
    remediationStatus: string | null;
  }>;
  error: string | null;
}> {
  const { userId } = await auth();
  if (!userId) return { run: null, findings: [], error: "Unauthorized" };

  const supabase = await createClient();

  const { data: user } = await supabase
    .from("users")
    .select("clinic_id")
    .eq("clerk_user_id", userId)
    .single();

  if (!user) return { run: null, findings: [], error: "User not found" };

  const { data: run } = await supabase
    .from("audit_runs")
    .select(`
      id, run_type, status, readiness_score, started_at, completed_at,
      users!audit_runs_created_by_user_id_fkey ( email )
    `)
    .eq("id", runId)
    .eq("clinic_id", user.clinic_id)
    .maybeSingle();

  if (!run) return { run: null, findings: [], error: "Audit not found" };

  const { data: findings } = await supabase
    .from("audit_findings")
    .select("id, checklist_item, status, auto_filled, notes, remediation_due_date, remediation_status, created_at")
    .eq("audit_run_id", runId)
    .order("created_at");

  return {
    run: {
      id: run.id,
      runType: run.run_type,
      status: run.status,
      readinessScore: run.readiness_score,
      startedAt: run.started_at,
      completedAt: run.completed_at,
      createdBy: ((run.users as UserEmailRef)?.email) ?? "Unknown",
    },
    findings: (findings ?? []).map((f) => ({
      id: f.id,
      checklistItem: f.checklist_item as ChecklistItemId,
      status: f.status as FindingStatus,
      autoFilled: f.auto_filled,
      notes: f.notes,
      remediationDueDate: f.remediation_due_date,
      remediationStatus: f.remediation_status,
    })),
    error: null,
  };
}
