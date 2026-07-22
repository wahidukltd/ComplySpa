import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Users, ShieldCheck, AlertTriangle, Clock, Plus } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const supabase = await createClient();
  const { data: userRecord, error: userErr } = await supabase
    .from("users")
    .select("clinic_id, role")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (userErr || !userRecord) redirect("/onboarding");

  const clinicId = userRecord.clinic_id;

  const [
    { count: staffCount },
    { count: totalCredentials },
    { count: expiredCount },
    { count: expiringCount },
  ] = await Promise.all([
    supabase
      .from("staff_members")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId)
      .is("deleted_at", null),
    supabase
      .from("credentials")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId),
    supabase
      .from("credentials")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId)
      .eq("status", "expired"),
    supabase
      .from("credentials")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId)
      .eq("status", "expiring"),
    supabase
      .from("credentials")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId)
      .eq("status", "valid"),
  ]);

  const s = staffCount ?? 0;
  const c = totalCredentials ?? 0;

  const { data: recentFailedAlerts } = await supabase
    .from("alert_logs")
    .select("id, credential_id, alert_type, sent_at, delivery_status")
    .eq("clinic_id", clinicId)
    .eq("delivery_status", "failed")
    .order("sent_at", { ascending: false })
    .limit(5);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight xl:text-3xl">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Overview of your clinic&apos;s compliance status.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/staff/new" className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}>
            <Plus className="size-4" />
            Add staff
          </Link>
          <Link href="/dashboard/staff" className={cn(buttonVariants({ variant: "default" }), "gap-1.5")}>
            <Users className="size-4" />
            View staff
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:gap-6 2xl:gap-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Staff</CardTitle>
            <Users className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold xl:text-3xl">{s}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Credentials</CardTitle>
            <ShieldCheck className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold xl:text-3xl">{c}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Expiring Soon</CardTitle>
            <Clock className="size-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold xl:text-3xl text-warning">{expiringCount ?? 0}</div>
            <p className="text-xs text-muted-foreground">Within 90 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Expired</CardTitle>
            <AlertTriangle className="size-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold xl:text-3xl text-destructive">{expiredCount ?? 0}</div>
            <p className="text-xs text-muted-foreground">Requires immediate action</p>
          </CardContent>
        </Card>
      </div>

      {recentFailedAlerts && recentFailedAlerts.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/10">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="size-5 shrink-0 text-destructive" />
            <div>
              <p className="text-sm font-medium text-destructive">
                {recentFailedAlerts.length} alert{recentFailedAlerts.length > 1 ? "s" : ""} failed to deliver
              </p>
              <Link
                href="/dashboard/alerts"
                className="text-sm text-destructive underline hover:text-destructive/80"
              >
                View alert history →
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {s > 0 && (
        <Card className="border-warning bg-warning-tint">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="size-5 shrink-0 text-warning" />
            <p className="text-sm text-warning-foreground">
              Have you verified that each provider&apos;s procedures match their license scope for your state?
              Staff performing services outside their license is the #1 cause of board investigations.
            </p>
          </CardContent>
        </Card>
      )}

      {s > 0 && c === 0 && (
        <Card style={{ borderColor: "#FBF0E0", backgroundColor: "#FFF8F2" }}>
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="size-5 shrink-0" style={{ color: "#C2853A" }} />
            <div>
              <p className="text-sm font-medium" style={{ color: "#7A4E1F" }}>
                Your staff has no credentials tracked yet
              </p>
              <p className="text-sm mt-0.5" style={{ color: "rgba(0,0,0,0.55)" }}>
                Add credentials to start tracking expirations and compliance.
                {' '}<Link href="/dashboard/staff" className="underline" style={{ color: "#6E97A7" }}>Go to staff</Link>
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {s === 0 && (
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-5 text-muted-foreground" />
              No staff members yet
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Add your first staff member to start tracking licenses, certifications, and compliance deadlines.
            </p>
            <Link href="/dashboard/staff/new" className={cn(buttonVariants({ variant: "default" }), "gap-1.5")}>
              <Plus className="size-4" />
              Add your first staff member
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
