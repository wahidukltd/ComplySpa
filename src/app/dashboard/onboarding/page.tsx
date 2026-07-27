import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { OnboardingList } from "./onboarding-list";

export const dynamic = "force-dynamic";

export default async function OnboardingDashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;
  if (!userId) redirect("/sign-in");
  const { data: userRecord, error: userErr } = await supabase
    .from("users")
    .select("clinic_id")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (userErr || !userRecord) redirect("/onboarding");

  const { data: staff } = await supabase
    .from("staff_members")
    .select("id, name, role")
    .eq("clinic_id", userRecord.clinic_id)
    .is("deleted_at", null)
    .is("suspended_at", null)
    .order("name");

  const staffIds = (staff ?? []).map((s) => s.id);

  type StaffProgress = {
    total: number; completed: number; pending: number; skipped: number;
    requiredTotal: number; requiredCompleted: number;
    optionalTotal: number; optionalCompleted: number;
    blocked: boolean; missingNames: string[];
  };
  const progressMap: Record<string, StaffProgress> = {};

  if (staffIds.length > 0) {
    const { data: items } = await supabase
      .from("onboarding_items")
      .select(`
        staff_member_id,
        status,
        is_required,
        credential_type:credential_types!onboarding_items_credential_type_id_fkey(name)
      `)
      .in("staff_member_id", staffIds);

    if (items) {
      for (const id of staffIds) {
        const memberItems = items.filter((i) => i.staff_member_id === id);
        const required = memberItems.filter((i) => i.is_required);
        const requiredPending = required.filter((i) => i.status === "pending");
        progressMap[id] = {
          total: memberItems.length,
          completed: memberItems.filter((i) => i.status === "completed").length,
          pending: memberItems.filter((i) => i.status === "pending").length,
          skipped: memberItems.filter((i) => i.status === "skipped").length,
          requiredTotal: required.length,
          requiredCompleted: required.filter((i) => i.status === "completed").length,
          optionalTotal: memberItems.filter((i) => !i.is_required).length,
          optionalCompleted: memberItems.filter((i) => !i.is_required && i.status === "completed").length,
          blocked: requiredPending.length > 0,
          missingNames: requiredPending.map((i) => i.credential_type?.name ?? "Unknown").filter(Boolean),
        };
      }
    }
  }

  const staffList = (staff ?? []).map((s) => ({
    ...s,
    progress: progressMap[s.id] ?? {
      total: 0, completed: 0, pending: 0, skipped: 0,
      requiredTotal: 0, requiredCompleted: 0,
      optionalTotal: 0, optionalCompleted: 0,
      blocked: false, missingNames: [],
    },
  }));

  const readyCount = staffList.filter(
    (s) => s.progress.requiredTotal > 0 && !s.progress.blocked,
  ).length;
  const inProgressCount = staffList.filter(
    (s) => s.progress.requiredTotal > 0 && s.progress.requiredCompleted > 0 && s.progress.blocked,
  ).length;
  const blockedCount = staffList.filter(
    (s) => s.progress.requiredTotal > 0 && s.progress.requiredCompleted === 0 && s.progress.blocked,
  ).length;
  const notStartedCount = staffList.filter(
    (s) => s.progress.requiredTotal === 0,
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Onboarding"
        description="Track staff readiness at a glance."
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold text-[#4A8C5C]">{readyCount}</p>
            <p className="text-sm text-muted-foreground">Ready to start</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold text-[#C2853A]">{inProgressCount}</p>
            <p className="text-sm text-muted-foreground">In progress</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold text-destructive">{blockedCount}</p>
            <p className="text-sm text-muted-foreground">Blocked</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold text-muted-foreground">{notStartedCount}</p>
            <p className="text-sm text-muted-foreground">Not started</p>
          </CardContent>
        </Card>
      </div>

      {staffList.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <p className="text-sm text-muted-foreground">
            No staff members yet. Add staff to start tracking onboarding progress.
          </p>
          <Link href="/dashboard/staff/new" className={cn(buttonVariants({ variant: "default" }), "mt-4 gap-1.5")}>
            Add staff
          </Link>
        </div>
      ) : (
        <OnboardingList staffList={staffList} />
      )}
    </div>
  );
}
