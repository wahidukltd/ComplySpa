import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils";
import { ROLE_DISPLAY_LABELS } from "@/lib/staff/role-credential-defaults";
import { getStaffOnboarding } from "@/lib/actions/onboarding";
import { OnboardingChecklist } from "@/components/staff/staff-onboarding-checklist";
import { Pencil, Plus, Paperclip } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function StaffDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
    .select("id, name, role, email, phone, hire_date, procedures_performed, location, department, manager")
    .eq("id", id)
    .eq("clinic_id", userRecord.clinic_id)
    .is("deleted_at", null)
    .is("suspended_at", null)
    .single();

  if (!staff) notFound();

  const { data: credentials } = await supabase
    .from("credentials")
    .select(`
      id,
      license_number,
      state,
      expiration_date,
      status,
      document_url,
      credential_type:credential_types!credentials_credential_type_id_fkey(name, category)
    `)
    .eq("staff_member_id", id)
    .eq("clinic_id", userRecord.clinic_id)
    .is("suspended_at", null)
    .order("expiration_date", { ascending: true, nullsFirst: false });

  const roleLabel = staff.role ? (ROLE_DISPLAY_LABELS[staff.role] ?? staff.role) : null;

  const { items: onboardingItems = [], progress: onboardingProgress = {
    total: 0, completed: 0, skipped: 0, pending: 0,
    requiredTotal: 0, requiredCompleted: 0,
    optionalTotal: 0, optionalCompleted: 0,
    blocked: false,
  } } =
    await getStaffOnboarding(id).then((r) => ("items" in r ? r : { items: [], progress: {
      total: 0, completed: 0, skipped: 0, pending: 0,
      requiredTotal: 0, requiredCompleted: 0,
      optionalTotal: 0, optionalCompleted: 0,
      blocked: false,
    } }));

  const validCount = credentials?.filter((c) => c.status === "valid").length ?? 0;
  const expiringCount = credentials?.filter((c) => c.status === "expiring").length ?? 0;
  const expiredCount = credentials?.filter((c) => c.status === "expired").length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={staff.name} description={roleLabel ? `Role: ${roleLabel}` : undefined}>
        <Link href={`/dashboard/staff/${id}/edit`} className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}>
          <Pencil className="size-4" />
          Edit
        </Link>
      </PageHeader>

      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          {staff.email && (
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p>{staff.email}</p>
            </div>
          )}
          {staff.phone && (
            <div>
              <p className="text-xs text-muted-foreground">Phone</p>
              <p>{staff.phone}</p>
            </div>
          )}
          {staff.location && (
            <div>
              <p className="text-xs text-muted-foreground">Location</p>
              <p>{staff.location}</p>
            </div>
          )}
          {staff.department && (
            <div>
              <p className="text-xs text-muted-foreground">Department</p>
              <p>{staff.department}</p>
            </div>
          )}
          {staff.hire_date && (
            <div>
              <p className="text-xs text-muted-foreground">Hire Date</p>
              <p>{formatDate(staff.hire_date)}</p>
            </div>
          )}
          {staff.manager && (
            <div>
              <p className="text-xs text-muted-foreground">Manager</p>
              <p>{staff.manager}</p>
            </div>
          )}
          {staff.procedures_performed?.length > 0 && (
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground">Procedures Performed</p>
              <p>{staff.procedures_performed.join(", ")}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <OnboardingChecklist
        items={onboardingItems}
        total={onboardingProgress.total}
        completed={onboardingProgress.completed}
        staffMemberId={id}
        requiredTotal={onboardingProgress.requiredTotal}
        requiredCompleted={onboardingProgress.requiredCompleted}
        optionalTotal={onboardingProgress.optionalTotal}
        optionalCompleted={onboardingProgress.optionalCompleted}
        blocked={onboardingProgress.blocked}
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Credentials</h2>
          {credentials && credentials.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="text-status-valid">{validCount} valid</span>
              {expiringCount > 0 && <span className="text-status-expiring">· {expiringCount} expiring</span>}
              {expiredCount > 0 && <span className="text-destructive">· {expiredCount} expired</span>}
            </div>
          )}
        </div>
        <Link href={`/dashboard/staff/${id}/credentials/new`} className={cn(buttonVariants({ variant: "default", size: "sm" }), "gap-1.5")}>
          <Plus className="size-4" />
          Add credential
        </Link>
      </div>

      {!credentials || credentials.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              No credentials yet. Add a license, certification, or training record.
            </p>
            <Link href={`/dashboard/staff/${id}/credentials/new`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}>
              <Plus className="size-4" />
              Add first credential
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {credentials.map((cred) => {
            const category = cred.credential_type?.category;
            return (
              <Link
                key={cred.id}
                href={`/dashboard/credentials/${cred.id}`}
                className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{cred.credential_type?.name ?? "Credential"}</p>
                    {category && (
                      <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {category}
                      </span>
                    )}
                    {cred.document_url && (
                      <Paperclip className="size-3 shrink-0 text-muted-foreground" />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {cred.license_number && `${cred.license_number} · `}
                    {cred.state && `${cred.state} · `}
                    {cred.expiration_date && `Expires ${formatDate(cred.expiration_date)}`}
                  </p>
                </div>
                <Badge
                  variant={
                    cred.status === "expired"
                      ? "destructive"
                      : cred.status === "expiring"
                        ? "secondary"
                        : "default"
                  }
                >
                  {cred.status}
                </Badge>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
