"use server";
import "server-only";

import { createClient } from "@/lib/supabase/server";
import * as Sentry from "@sentry/nextjs";
import { randomUUID } from "node:crypto";
import type { ReportData } from "@/lib/pdf/report-template";
import { getReportTier } from "@/lib/utils/entitlements";

export async function getReportData(): Promise<{
  data: ReportData | null;
  error: string | null;
  reportTier?: "basic" | "audit";
}> {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  const userId = authUser?.id;
  if (!userId) return { data: null, error: "Unauthorized" };

  const { data: user, error: userErr } = await supabase
    .from("users")
    .select("id, email, clinic_id")
    .eq("auth_user_id", userId)
    .single();

  if (userErr || !user) {
    Sentry.captureException(userErr ?? new Error("User not found"));
    return { data: null, error: "User not found" };
  }

  const clinicId = user.clinic_id;

  const [clinicResult, staffResult] = await Promise.all([
    supabase.from("clinics").select("name, address, state, plan, trial_plan").eq("id", clinicId).single(),
    supabase.from("staff_members").select("id, name, role, hire_date").eq("clinic_id", clinicId).is("deleted_at", null).is("suspended_at", null).order("name"),
  ]);

  if (clinicResult.error || !clinicResult.data) {
    Sentry.captureException(clinicResult.error ?? new Error("Clinic not found"));
    return { data: null, error: "Clinic not found" };
  }

  if (staffResult.error || !staffResult.data) {
    Sentry.captureException(staffResult.error ?? new Error("Staff not found"));
    return { data: null, error: "Failed to load staff" };
  }

  const clinic = clinicResult.data;
  const staffRows = staffResult.data;

  // MD is the first staff with role MD or DO — queried from the same set
  const md = staffRows.find((s) => s.role === "MD" || s.role === "DO") ?? null;

  const [credResult, alertResult] = await Promise.all([
    supabase
      .from("credentials")
      .select(`id, staff_member_id, license_number, state,
        issue_date, expiration_date, status, last_verified_date,
        credential_type_id,
        credential_types ( name, category )`)
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .is("suspended_at", null),
    supabase
      .from("alert_logs")
      .select("credential_id, days_before_expiration")
      .eq("clinic_id", clinicId)
      .order("sent_at", { ascending: false }),
  ]);

  if (credResult.error) {
    Sentry.captureException(credResult.error);
    return { data: null, error: "Failed to load credential data" };
  }

  if (alertResult.error) Sentry.captureException(alertResult.error);

  const credRows = credResult.data ?? [];
  const alertRows = alertResult.data ?? [];

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

  // ponytail: no pagination — Practice cap 300 creds

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

  // Trial is a subscription state — the report tier comes from the plan being
  // evaluated (clinics.trial_plan), resolved through the single entitlement path.
  const reportTier = getReportTier(clinic.plan, clinic.trial_plan);
  const tier = reportTier !== "none" ? reportTier : undefined;

  return { data, error: null, reportTier: tier };
}
