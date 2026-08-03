import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { ArrowLeft } from "lucide-react";
import { RenewalFormWrapper } from "./renewal-form-wrapper";

export const dynamic = "force-dynamic";

export default async function RenewCredentialPage({
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
    .select("clinic_id, role")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (userErr || !userRecord) redirect("/onboarding");

  // Renewal is a write; viewers get 404 (staff-edit pattern).
  if (userRecord.role === "viewer") notFound();

  const { data: credential } = await supabase
    .from("credentials")
    .select(`
      id,
      credential_type_id,
      staff_member_id,
      license_number,
      state,
      issue_date,
      expiration_date,
      status,
      verification_url,
      document_url,
      notes,
      staff:staff_members!credentials_staff_member_id_fkey(name),
      credential_type:credential_types!credentials_credential_type_id_fkey(name, category, default_renewal_cycle_days)
    `)
    .eq("id", id)
    .eq("clinic_id", userRecord.clinic_id)
    .is("deleted_at", null)
    .is("suspended_at", null)
    .single();

  if (!credential) notFound();

  const typeName = credential.credential_type?.name ?? "Credential";
  const staffName = credential.staff?.name ?? "Unknown";
  const renewalDays = credential.credential_type?.default_renewal_cycle_days;

  const baseDefaults = {
    credential_type_id: credential.credential_type_id,
    staff_member_id: credential.staff_member_id,
    license_number: credential.license_number ?? "",
    state: credential.state ?? "",
    verification_url: credential.verification_url ?? "",
    notes: credential.notes ?? "",
    document_url: credential.document_url ?? null,
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/dashboard/credentials/${id}`}
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to credential details
        </Link>
      </div>

      <PageHeader
        title={`Renew ${typeName}`}
        description={`For ${staffName}`}
      />

      <div className="max-w-lg">
        <RenewalFormWrapper
          credentialId={id}
          staffMemberId={credential.staff_member_id}
          renewalDays={renewalDays}
          typeName={typeName}
          baseDefaults={baseDefaults}
        />
      </div>
    </div>
  );
}
