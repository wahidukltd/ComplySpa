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

  function formatMissing(names: string[]): string {
    if (names.length === 0) return "";
    if (names.length <= 3) return names.join(", ");
    return names.slice(0, 3).join(", ") + ` +${names.length - 3} more`;
  }

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
        <div className="space-y-2">
          {staffList.map((member) => {
            const pct =
              member.progress.requiredTotal > 0
                ? Math.round((member.progress.requiredCompleted / member.progress.requiredTotal) * 100)
                : 0;
            return (
              <Link
                key={member.id}
                href={`/dashboard/staff/${member.id}`}
                className="block rounded-lg border p-4 hover:bg-muted/50"
              >
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{member.name}</p>
                      <Badge
                        variant={
                          member.progress.requiredTotal === 0
                            ? "outline"
                            : !member.progress.blocked
                              ? "default"
                              : member.progress.requiredCompleted > 0
                                ? "secondary"
                                : "destructive"
                        }
                        className="text-xs"
                      >
                        {member.progress.requiredTotal === 0
                          ? "Pending"
                          : !member.progress.blocked
                            ? "Ready"
                            : member.progress.requiredCompleted > 0
                              ? `${pct}%`
                              : "Blocked"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {member.role ? (ROLE_DISPLAY_LABELS[member.role] ?? member.role) : "No role"}
                    </p>
                    {member.progress.blocked && member.progress.missingNames.length > 0 && (
                      <p className="text-xs text-destructive">
                        ❌ {formatMissing(member.progress.missingNames)}
                      </p>
                    )}
                    {!member.progress.blocked && member.progress.requiredTotal > 0 && (
                      <p className="text-xs text-[#4A8C5C]">
                        ✓ All required items complete
                        {member.progress.optionalTotal > 0 && member.progress.optionalCompleted < member.progress.optionalTotal && (
                          <span className="text-muted-foreground">
                            {" "}({member.progress.optionalCompleted}/{member.progress.optionalTotal} optional)
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-20 overflow-hidden rounded-full bg-muted sm:w-28">
                        <div
                          className={`h-full rounded-full ${
                            member.progress.requiredTotal === 0
                              ? "bg-muted-foreground/20"
                              : !member.progress.blocked
                                ? "bg-[#4A8C5C]"
                                : "bg-[#C2853A]"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {member.progress.requiredTotal > 0
                          ? `${member.progress.requiredCompleted}/${member.progress.requiredTotal}`
                          : "—"}
                      </span>
                    </div>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
