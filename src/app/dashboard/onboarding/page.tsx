import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ROLE_DISPLAY_LABELS } from "@/lib/staff/role-credential-defaults";
import { ArrowRight } from "lucide-react";

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

  type StaffProgress = { total: number; completed: number; pending: number; skipped: number };
  const progressMap: Record<string, StaffProgress> = {};

  if (staffIds.length > 0) {
    const { data: items } = await supabase
      .from("onboarding_items")
      .select("staff_member_id, status")
      .in("staff_member_id", staffIds);

    if (items) {
      for (const id of staffIds) {
        const memberItems = items.filter((i) => i.staff_member_id === id);
        progressMap[id] = {
          total: memberItems.length,
          completed: memberItems.filter((i) => i.status === "completed").length,
          pending: memberItems.filter((i) => i.status === "pending").length,
          skipped: memberItems.filter((i) => i.status === "skipped").length,
        };
      }
    }
  }

  const staffList = (staff ?? []).map((s) => ({
    ...s,
    progress: progressMap[s.id] ?? { total: 0, completed: 0, pending: 0, skipped: 0 },
  }));

  const readyCount = staffList.filter(
    (s) => s.progress.total > 0 && s.progress.completed === s.progress.total,
  ).length;
  const inProgressCount = staffList.filter(
    (s) => s.progress.total > 0 && s.progress.completed > 0 && s.progress.completed < s.progress.total,
  ).length;
  const notStartedCount = staffList.filter(
    (s) => s.progress.total === 0 || s.progress.completed === 0,
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Onboarding"
        description="Track staff readiness at a glance."
      />

      <div className="grid gap-4 sm:grid-cols-3">
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
        <div className="space-y-2">
          {staffList.map((member) => {
            const pct =
              member.progress.total > 0
                ? Math.round((member.progress.completed / member.progress.total) * 100)
                : 0;
            return (
              <Link
                key={member.id}
                href={`/dashboard/staff/${member.id}`}
                className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50"
              >
                <div className="flex items-center gap-4">
                  <div className="flex flex-col">
                    <p className="font-medium">{member.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {member.role ? (ROLE_DISPLAY_LABELS[member.role] ?? member.role) : "No role"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 overflow-hidden rounded-full bg-muted sm:w-32">
                      <div
                        className={`h-full rounded-full ${
                          member.progress.total === 0
                            ? "bg-muted-foreground/20"
                            : pct === 100
                              ? "bg-[#4A8C5C]"
                              : "bg-[#C2853A]"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {member.progress.total > 0
                        ? `${member.progress.completed}/${member.progress.total}`
                        : "—"}
                    </span>
                  </div>
                  <Badge
                    variant={
                      member.progress.total === 0
                        ? "outline"
                        : pct === 100
                          ? "default"
                          : "secondary"
                    }
                    className="text-xs"
                  >
                    {member.progress.total === 0
                      ? "Pending"
                      : pct === 100
                        ? "Ready"
                        : `${pct}%`}
                  </Badge>
                  <ArrowRight className="size-4 text-muted-foreground" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
