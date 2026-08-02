import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getStaffReadinessBulk, type ReadinessResult } from "@/lib/staff/readiness";
import { getOnboardingStateByStaff } from "@/lib/staff/onboarding";
import { buildComplianceActionsFromReadiness, type ComplianceAction } from "@/lib/staff/compliance-actions";
import { computeComplianceHealth } from "@/lib/utils/compliance-health";
import { computeSystemHealth, CRON_JOBS, type SystemIssue } from "@/lib/utils/notification-history";
import * as Sentry from "@sentry/nextjs";

export { computeComplianceHealth } from "@/lib/utils/compliance-health";

export interface OverviewStaffSummary {
  total: number;
  ready: number;
  atRisk: number;
  nonCompliant: number;
  pending: number;
}

export interface RecentChange {
  id: string;
  type: "credential_added" | "staff_added" | "onboarding_completed";
  title: string;
  timestamp: string;
  href: string;
}

export interface OverviewData {
  staffSummary: OverviewStaffSummary;
  complianceHealth: { score: number; readyCount: number; totalStaff: number };
  actions: ComplianceAction[];
  actionCounts: { critical: number; warning: number; info: number };
  credentialHealth: { total: number; valid: number; expiring: number; expired: number };
  recentChanges: RecentChange[];
  systemHealth: { degraded: boolean; issues: SystemIssue[] };
  renderedAt: string;
  sectionErrors: string[];
  hasStaff: boolean;
  hasCredentials: boolean;
  readinessUnavailable: boolean;
}

const EMPTY_STAFF_SUMMARY: OverviewStaffSummary = { total: 0, ready: 0, atRisk: 0, nonCompliant: 0, pending: 0 };
const EMPTY_CREDENTIAL_HEALTH = { total: 0, valid: 0, expiring: 0, expired: 0 };

function safeSection<T>(key: string, errors: string[], fn: () => Promise<T>, fallback: T): Promise<T> {
  return fn().catch((err) => {
    Sentry.captureException(err);
    errors.push(key);
    return fallback;
  });
}

/** Throw on supabase-js `.error` so safeSection records the section as failed
 * (supabase-js returns { data, error } without rejecting — a section that
 * ignores `.error` silently renders fallback data as if it were real). */
function throwOnError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function getOverviewData(clinicId: string): Promise<OverviewData> {
  const errors: string[] = [];
  const renderedAt = new Date().toISOString();
  const supabase = await createClient();

  const staffRows = await safeSection(
    "staff",
    errors,
    async () => {
      const { data, error } = await supabase
        .from("staff_members")
        .select("id, name, role, created_at")
        .eq("clinic_id", clinicId)
        .is("deleted_at", null)
        .is("suspended_at", null)
        .order("name");
      throwOnError(error);
      return data ?? [];
    },
    [] as { id: string; name: string; role: string | null; created_at: string }[],
  );

  const [credentialHealth, onboardingState, recentChanges, systemHealth] = await Promise.all([
    safeSection(
      "credentials",
      errors,
      async () => {
        const base = supabase
          .from("credentials")
          .select("id", { count: "exact", head: true })
          .eq("clinic_id", clinicId)
          .is("deleted_at", null)
          .is("suspended_at", null);
        const [total, valid, expiring, expired] = await Promise.all([
          base,
          base.eq("status", "valid"),
          base.eq("status", "expiring"),
          base.eq("status", "expired"),
        ]);
        for (const r of [total, valid, expiring, expired]) {
          throwOnError(r.error);
        }
        return {
          total: total.count ?? 0,
          valid: valid.count ?? 0,
          expiring: expiring.count ?? 0,
          expired: expired.count ?? 0,
        };
      },
      EMPTY_CREDENTIAL_HEALTH,
    ),
    safeSection(
      "onboarding",
      errors,
      () => getOnboardingStateByStaff(clinicId, staffRows.map((s) => s.id)),
      null,
    ),
    safeSection(
      "recent_changes",
      errors,
      async () => {
        const changes: RecentChange[] = [];
        // Only surface events for currently visible (non-deleted, non-suspended)
        // staff — otherwise a deleted staff member's name leaks into the feed
        // and a suspended member's name renders as "Unknown".
        const visibleStaffIds = staffRows.map((s) => s.id);
        if (visibleStaffIds.length === 0) return [];

        const { data: newCreds, error: credsErr } = await supabase
          .from("credentials")
          .select(`
            id,
            created_at,
            staff_member_id,
            staff:staff_members!credentials_staff_member_id_fkey(name),
            credential_type:credential_types!credentials_credential_type_id_fkey(name)
          `)
          .eq("clinic_id", clinicId)
          .in("staff_member_id", visibleStaffIds)
          .is("deleted_at", null)
          .is("suspended_at", null)
          .order("created_at", { ascending: false })
          .limit(5);
        throwOnError(credsErr);
        for (const c of newCreds ?? []) {
          changes.push({
            id: `credential:${c.id}`,
            type: "credential_added",
            title: `${c.credential_type?.name ?? "Credential"} added — ${c.staff?.name ?? "Unknown"}`,
            timestamp: c.created_at,
            href: `/dashboard/credentials/${c.id}`,
          });
        }

        const { data: newStaff, error: staffErr } = await supabase
          .from("staff_members")
          .select("id, name, created_at")
          .eq("clinic_id", clinicId)
          .is("deleted_at", null)
          .is("suspended_at", null)
          .order("created_at", { ascending: false })
          .limit(5);
        throwOnError(staffErr);
        for (const s of newStaff ?? []) {
          changes.push({
            id: `staff:${s.id}`,
            type: "staff_added",
            title: `${s.name} joined`,
            timestamp: s.created_at,
            href: `/dashboard/staff/${s.id}`,
          });
        }

        const { data: completedItems, error: itemsErr } = await supabase
          .from("onboarding_items")
          .select(`
            id,
            completed_at,
            staff_member_id,
            staff:staff_members!onboarding_items_staff_member_id_fkey(name),
            credential_type:credential_types!onboarding_items_credential_type_id_fkey(name)
          `)
          .eq("clinic_id", clinicId)
          .in("staff_member_id", visibleStaffIds)
          .not("completed_at", "is", null)
          .order("completed_at", { ascending: false })
          .limit(5);
        throwOnError(itemsErr);
        for (const i of completedItems ?? []) {
          changes.push({
            id: `onboarding:${i.id}`,
            type: "onboarding_completed",
            title: `${i.credential_type?.name ?? "Requirement"} completed — ${i.staff?.name ?? "Unknown"}`,
            timestamp: i.completed_at!,
            href: `/dashboard/staff/${i.staff_member_id}`,
          });
        }

        changes.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        return changes.slice(0, 5);
      },
      [] as RecentChange[],
    ),
    safeSection(
      "system_health",
      errors,
      async () => {
        // Platform-level signals only: cron staleness (same jobs/windows as
        // /api/health) + a delivery-failure burst in 24h. Individual delivery
        // failures never surface here — they belong to Notification History.
        // ponytail: 5 RPC calls per overview render (viewers included) — trivial
        // indexed reads, same function the public /api/health endpoint already
        // calls; cache/short-circuit if dashboard render volume grows.
        // check_cron_health is granted EXECUTE to anon (027) — load-bearing for
        // the public health endpoint; do not revoke.
        const cronResults = await Promise.all(
          CRON_JOBS.map(async (job) => {
            const { data, error } = await supabase.rpc("check_cron_health", {
              p_jobname: job.jobname,
              p_max_stale_hours: job.maxStaleHours,
            });
            if (error) throw new Error(error.message);
            // Strict coercion: the RPC contract (026/027) returns real
            // FALSE for never-run/unknown jobs; errors throw above. NULL
            // (future contract drift) must not fabricate a cron issue.
            return { jobname: job.jobname, ok: data === true };
          }),
        );

        const { count, error: burstErr } = await supabase
          .from("alert_logs")
          .select("id", { count: "exact", head: true })
          .eq("clinic_id", clinicId)
          .eq("delivery_status", "failed")
          .gt("sent_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString());
        if (burstErr) throw new Error(burstErr.message);

        const issues = computeSystemHealth(cronResults, count ?? 0);
        return { degraded: issues.length > 0, issues };
      },
      { degraded: false, issues: [] },
    ),
  ]);

  const hasStaff = staffRows.length > 0;
  const hasCredentials = credentialHealth.total > 0;

  const staffSummary: OverviewStaffSummary = { ...EMPTY_STAFF_SUMMARY };
  let readinessMap: Record<string, ReadinessResult> = {};
  let readinessUnavailable = false;

  if (hasStaff) {
    readinessMap = await safeSection(
      "readiness",
      errors,
      () => getStaffReadinessBulk(staffRows.map((s) => s.id), clinicId),
      {} as Record<string, ReadinessResult>,
    );
    // getStaffReadinessBulk catches internally and returns per-staff fallbacks;
    // an empty result for a clinic that HAS staff means the readiness engine
    // failed, not that nobody is tracked. Surface it so the hero doesn't
    // render "0 of 0".
    readinessUnavailable = Object.keys(readinessMap).length === 0;
  }

  for (const r of Object.values(readinessMap)) {
    staffSummary.total++;
    if (r.status === "ready") staffSummary.ready++;
    else if (r.status === "at_risk") staffSummary.atRisk++;
    else if (r.status === "non_compliant") staffSummary.nonCompliant++;
    else staffSummary.pending++;
  }

  const complianceHealth = computeComplianceHealth(readinessMap);

  let actions: ComplianceAction[] = [];
  if (hasStaff && !readinessUnavailable) {
    actions = await safeSection(
      "actions",
      errors,
      () => buildComplianceActionsFromReadiness(staffRows, readinessMap, clinicId, onboardingState),
      [] as ComplianceAction[],
    );
  }
  const actionCounts = {
    critical: actions.filter((a) => a.urgency === "critical").length,
    warning: actions.filter((a) => a.urgency === "warning").length,
    info: actions.filter((a) => a.urgency === "info").length,
  };

  return {
    staffSummary,
    complianceHealth,
    actions,
    actionCounts,
    credentialHealth,
    recentChanges,
    systemHealth,
    renderedAt,
    sectionErrors: errors,
    hasStaff,
    hasCredentials,
    readinessUnavailable,
  };
}
