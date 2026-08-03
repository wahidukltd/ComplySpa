import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Plus, Users } from "lucide-react";
import Link from "next/link";
import { CredentialsTable } from "./credentials-table";

export const dynamic = "force-dynamic";

export default async function CredentialsListPage() {
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

  const canEdit = userRecord.role === "owner" || userRecord.role === "manager";

  const { count: staffCount } = await supabase
    .from("staff_members")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", userRecord.clinic_id)
    .is("deleted_at", null)
    .is("suspended_at", null);

  const hasStaff = (staffCount ?? 0) > 0;

  const { data: credentials } = await supabase
    .from("credentials")
    .select(`
      id,
      license_number,
      state,
      issue_date,
      expiration_date,
      status,
      verification_url,
      last_verified_date,
      document_url,
      notes,
      credential_type_id,
      staff_member_id,
      staff:staff_members!credentials_staff_member_id_fkey(name),
      credential_type:credential_types!credentials_credential_type_id_fkey(name, category)
    `)
    .eq("clinic_id", userRecord.clinic_id)
    .is("deleted_at", null)
    .is("suspended_at", null)
    .order("expiration_date", { ascending: true, nullsFirst: false });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Credentials"
        description="View all credentials across all staff members."
      >
        {canEdit &&
          (hasStaff ? (
            <Link href="/dashboard/credentials/new" className={cn(buttonVariants({ variant: "default" }), "gap-1.5")}>
              <Plus className="size-4" />
              Add credential
            </Link>
          ) : (
            <Link href="/dashboard/staff" className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}>
              <Users className="size-4" />
              Create staff
            </Link>
          ))}
      </PageHeader>

      <CredentialsTable
        credentials={credentials ?? []}
        context="clinic"
        hasStaff={hasStaff}
        canEdit={canEdit}
        addCredentialHref="/dashboard/credentials/new"
      />
    </div>
  );
}
