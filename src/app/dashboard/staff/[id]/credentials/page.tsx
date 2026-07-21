import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import Link from "next/link";
import { CredentialsTable } from "@/app/dashboard/credentials/credentials-table";

export const dynamic = "force-dynamic";

export default async function StaffCredentialsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const supabase = await createClient();
  const { data: userRecord, error: userErr } = await supabase
    .from("users")
    .select("clinic_id")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (userErr || !userRecord) redirect("/onboarding");

  const { data: staff } = await supabase
    .from("staff_members")
    .select("name")
    .eq("id", id)
    .eq("clinic_id", userRecord.clinic_id)
    .is("deleted_at", null)
    .single();

  if (!staff) notFound();

  const { data: credentials } = await supabase
    .from("credentials")
    .select(`
      id, license_number, state, issue_date, expiration_date, status,
      verification_url, last_verified_date, document_url, notes,
      credential_type_id, staff_member_id,
      staff:staff_members!credentials_staff_member_id_fkey(name),
      credential_type:credential_types!credentials_credential_type_id_fkey(name, category)
    `)
    .eq("staff_member_id", id)
    .eq("clinic_id", userRecord.clinic_id)
    .order("expiration_date", { ascending: true, nullsFirst: false });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${staff.name} — Credentials`}
        description={`Manage ${staff.name}'s licenses, certifications, and training records.`}
      >
        <Link href={`/dashboard/staff/${id}/credentials/new`} className={cn(buttonVariants({ variant: "default", size: "sm" }), "gap-1.5")}>
          <Plus className="size-4" />
          Add credential
        </Link>
      </PageHeader>

      <CredentialsTable credentials={credentials ?? []} />
    </div>
  );
}
