import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { StaffTableWrapper } from "./staff-table-wrapper";
import { cn } from "@/lib/utils";
import { getStaffReadinessBulk } from "@/lib/staff/readiness";
import { getOnboardingStateByStaff, type OnboardingStaffState } from "@/lib/staff/onboarding";
import { getRoleTemplates } from "@/lib/actions/role-templates";
import { formatRoleLabel } from "@/lib/utils/roles";
import * as Sentry from "@sentry/nextjs";
import type { Tables } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function StaffListPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;
  if (!userId) redirect("/sign-in");
  const { data: userRecord, error: userErr } = await supabase
    .from("users")
    .select("clinic_id, role")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (userErr || !userRecord) redirect("/onboarding");

  const { data: staff } = await supabase
    .from("staff_members")
    .select("id, clinic_id, name, role, hire_date, email, phone, procedures_performed, deleted_at, created_at, updated_at")
    .eq("clinic_id", userRecord.clinic_id)
    .is("deleted_at", null)
    .is("suspended_at", null)
    .order("name");

  const staffIds = (staff ?? []).map((s) => s.id);

  const readinessMap = await getStaffReadinessBulk(staffIds, userRecord.clinic_id);

  // Onboarding state degrades to "nothing pending" on failure rather than
  // killing the queue page, but the degradation is surfaced honestly: a
  // failure signal renders an unavailable notice above the table (mirrors the
  // overview's readinessUnavailable pattern) instead of silently mislabeling
  // every row as In Progress.
  let onboardingState: Record<string, OnboardingStaffState> = {};
  let onboardingFailed = false;
  try {
    onboardingState = await getOnboardingStateByStaff(userRecord.clinic_id, staffIds);
  } catch (err) {
    Sentry.captureException(err);
    onboardingFailed = true;
  }

  // getStaffReadinessBulk returns {} only when its staff query failed (it
  // catches per-staff errors internally) — an empty map for a clinic with
  // staff means the readiness engine itself is down.
  const readinessFailed = staffIds.length > 0 && Object.keys(readinessMap).length === 0;
  const dataUnavailable = onboardingFailed || readinessFailed;

  // Role filter chips follow the resolved template set (built-ins + custom
  // roles, clinic-wins) so every chip maps to a real template.
  const roleTemplatesResult = await getRoleTemplates();
  const templateRoles = new Set((roleTemplatesResult.data ?? []).map((t) => t.role));
  const roleOptions = [...templateRoles]
    .sort()
    .map((role) => ({ value: role, label: formatRoleLabel(role) }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Staff"
        description="Manage your clinic's staff members."
      >
        <Link href="/dashboard/staff/new" className={cn(buttonVariants({ variant: "default" }), "gap-1.5")}>
          <Plus className="size-4" />
          Add staff
        </Link>
      </PageHeader>

      <StaffTableWrapper
        staff={(staff ?? []) as Tables<"staff_members">[]}
        readinessMap={readinessMap}
        onboardingState={onboardingState}
        dataUnavailable={dataUnavailable}
        canEdit={userRecord.role !== "viewer"}
        roleOptions={roleOptions}
      />
    </div>
  );
}
