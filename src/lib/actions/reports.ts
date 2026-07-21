"use server";
import "server-only";

import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import type { Json } from "@/types/database";
import type { ReportData } from "@/lib/pdf/report-template";

const createReportSchema = z.object({
  reportUrl: z.string().nullable(),
});

export async function getReportData(): Promise<{
  data: ReportData | null;
  error: string | null;
}> {
  const { userId } = await auth();
  if (!userId) return { data: null, error: "Unauthorized" };

  const supabase = await createClient();

  const { data: user, error: userErr } = await supabase
    .from("users")
    .select("id, email, clinic_id")
    .eq("clerk_user_id", userId)
    .single();

  if (userErr || !user) {
    Sentry.captureException(userErr ?? new Error("User not found"));
    return { data: null, error: userErr?.message ?? "User not found" };
  }

  const clinicId = user.clinic_id;

  const { data: clinic, error: clinicErr } = await supabase
    .from("clinics")
    .select("name, address, state")
    .eq("id", clinicId)
    .single();

  if (clinicErr || !clinic) {
    Sentry.captureException(clinicErr ?? new Error("Clinic not found"));
    return { data: null, error: "Clinic not found" };
  }

  const { data: staffRows, error: staffErr } = await supabase
    .from("staff_members")
    .select("id, name, role, hire_date")
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .order("name");

  if (staffErr || !staffRows) {
    Sentry.captureException(staffErr ?? new Error("Staff not found"));
    return { data: null, error: "Failed to load staff" };
  }

  // MD is the first staff with role MD or DO — queried from the same set
  const md = staffRows.find((s) => s.role === "MD" || s.role === "DO") ?? null;

  const { data: credRows, error: credErr } = await supabase
    .from("credentials")
    .select(`
      id, staff_member_id, license_number, state,
      issue_date, expiration_date, status, last_verified_date,
      credential_type_id,
      credential_types ( name, category )
    `)
    .eq("clinic_id", clinicId);

  if (credErr) {
    Sentry.captureException(credErr);
    return { data: null, error: "Failed to load credential data" };
  }

  const { data: alertRows, error: alertErr } = await supabase
    .from("alert_logs")
    .select("credential_id, days_before_expiration")
    .eq("clinic_id", clinicId)
    .order("sent_at", { ascending: false });

  if (alertErr) Sentry.captureException(alertErr);

  const alertMap = new Map<string, Set<number>>();
  for (const a of alertRows ?? []) {
    const set = alertMap.get(a.credential_id) ?? new Set();
    set.add(a.days_before_expiration);
    alertMap.set(a.credential_id, set);
  }

  const credsByStaff = new Map<string, typeof credRows>();
  for (const c of credRows ?? []) {
    const list = credsByStaff.get(c.staff_member_id) ?? [];
    list.push(c);
    credsByStaff.set(c.staff_member_id, list);
  }

  let totalCreds = 0;
  let validCount = 0;
  let expiringCount = 0;
  let expiredCount = 0;
  let noExpirationCount = 0;
  const byCategory = { license: 0, training: 0, insurance: 0, agreement: 0 };
  const upcoming: ReportData["upcoming"] = [];

  // ponytail: no pagination — Practice cap 300 creds, Multi cap 1000

  const staffMembers: ReportData["staffMembers"] = staffRows.map((s) => {
    const staffCreds = credsByStaff.get(s.id) ?? [];
    const credentials = staffCreds.map((c) => {
      const ct = c.credential_types as { name: string; category: string } | null;
      const cat = ct?.category ?? "license";
      totalCreds++;
      if (!c.expiration_date) noExpirationCount++;
      if (c.status === "valid") validCount++;
      if (c.status === "expiring") expiringCount++;
      if (c.status === "expired") expiredCount++;
      if (byCategory[cat as keyof typeof byCategory] !== undefined) {
        byCategory[cat as keyof typeof byCategory]++;
      }

      if (c.expiration_date) {
        const daysLeft = Math.ceil(
          (new Date(c.expiration_date).getTime() - Date.now()) / 86400000,
        );
        if (daysLeft >= 0 && daysLeft <= 90) {
          const sentDays = alertMap.get(c.id);
          const sentList = sentDays
            ? [...sentDays].sort((a, b) => b - a).map(String)
            : [];
          upcoming.push({
            staffName: s.name,
            credentialType: ct?.name ?? "Unknown",
            expirationDate: c.expiration_date,
            daysLeft,
            status: c.status,
            alertsSent: sentList,
          });
        }
      }

      return {
        type: ct?.name ?? "Unknown",
        licenseNumber: c.license_number,
        state: c.state,
        issueDate: c.issue_date,
        expirationDate: c.expiration_date,
        status: c.status,
        lastVerified: c.last_verified_date,
      };
    });

    return {
      id: s.id,
      name: s.name,
      role: s.role,
      hireDate: s.hire_date,
      credentials,
    };
  });

  upcoming.sort((a, b) => a.daysLeft - b.daysLeft);

  const data: ReportData = {
    clinic: {
      name: clinic.name,
      address: clinic.address,
      state: clinic.state,
    },
    medicalDirector: md?.name ?? null,
    generatedBy: user.email,
    staffMembers,
    summary: {
      total: totalCreds,
      valid: validCount,
      expiring: expiringCount,
      expired: expiredCount,
      noExpiration: noExpirationCount,
      byCategory,
    },
    upcoming,
    reportId: randomUUID(),
    generatedAt: new Date().toISOString(),
  };

  return { data, error: null };
}

export async function createReport(
  reportUrl: string | null,
  snapshot: ReportData,
): Promise<{ id: string | null; error: string | null }> {
  const { userId } = await auth();
  if (!userId) return { id: null, error: "Unauthorized" };

  const supabase = await createClient();

  const { data: userRecord, error: userErr } = await supabase
    .from("users")
    .select("id, clinic_id, role")
    .eq("clerk_user_id", userId)
    .single();

  if (userErr || !userRecord) {
    Sentry.captureException(userErr ?? new Error("User not found"));
    return { id: null, error: "User not found" };
  }

  if (userRecord.role === "viewer") {
    return { id: null, error: "Viewers cannot generate reports" };
  }

  const parsed = createReportSchema.safeParse({ reportUrl });
  if (!parsed.success) {
    return { id: null, error: "Invalid report URL" };
  }

  const { data: clinic } = await supabase
    .from("clinics")
    .select("plan")
    .eq("id", userRecord.clinic_id)
    .single();

  if (!clinic || clinic.plan === "expired_trial" || clinic.plan === "inactive") {
    return { id: null, error: "Your plan does not support report generation." };
  }

  const { data: report, error } = await supabase
    .from("audit_reports")
    .insert({
      clinic_id: userRecord.clinic_id,
      generated_by_user_id: userRecord.id,
      report_url: reportUrl,
      report_data_snapshot: JSON.parse(JSON.stringify(snapshot)) as Json,
    })
    .select("id")
    .single();

  if (error) {
    Sentry.captureException(error);
    return { id: null, error: "Failed to save report record" };
  }

  revalidatePath("/dashboard/reports");
  return { id: report.id, error: null };
}

export async function getReportHistory(): Promise<{
  reports: Array<{
    id: string;
    generatedAt: string;
    generatedBy: string;
    reportUrl: string | null;
  }>;
  error: string | null;
  clinicId: string | null;
}> {
  const { userId } = await auth();
  if (!userId) return { reports: [], error: "Unauthorized", clinicId: null };

  const supabase = await createClient();

  const { data: user, error: userErr } = await supabase
    .from("users")
    .select("clinic_id")
    .eq("clerk_user_id", userId)
    .single();

  if (userErr || !user) {
    Sentry.captureException(userErr ?? new Error("User not found"));
    return { reports: [], error: "Failed to load user", clinicId: null };
  }

  const { data: reportRows, error } = await supabase
    .from("audit_reports")
    .select(`
      id, generated_at, report_url,
      users!audit_reports_generated_by_user_id_fkey ( email )
    `)
    .eq("clinic_id", user.clinic_id)
    .order("generated_at", { ascending: false })
    .limit(50);

  if (error) {
    Sentry.captureException(error);
    return { reports: [], error: "Failed to load report history", clinicId: null };
  }

  const reports = (reportRows ?? []).map((r) => {
    const userEmail = (r.users as { email: string } | null)?.email ?? "";
    return {
      id: r.id,
      generatedAt: r.generated_at,
      generatedBy: userEmail,
      reportUrl: r.report_url,
    };
  });

  return { reports, error: null, clinicId: user.clinic_id };
}
