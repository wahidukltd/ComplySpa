import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
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
    .select("clinic_id")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (userErr || !userRecord) redirect("/onboarding");

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
    .order("expiration_date", { ascending: true, nullsFirst: false });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Credentials"
        description="View all credentials across all staff members."
      >
        <Link href="/dashboard/staff" className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}>
          <Plus className="size-4" />
          Manage staff to add credentials
        </Link>
      </PageHeader>

      <CredentialsTable credentials={credentials ?? []} />
    </div>
  );
}

