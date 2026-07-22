import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { EditCredentialFormWrapper } from "./edit-credential-form-wrapper";

export const dynamic = "force-dynamic";

export default async function EditCredentialPage({
  params,
}: {
  params: Promise<{ id: string; credId: string }>;
}) {
  const { id, credId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;
  if (!userId) redirect("/sign-in");
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

  const { data: credential } = await supabase
    .from("credentials")
    .select("id, clinic_id, staff_member_id, credential_type_id, deleted_at, license_number, state, issue_date, expiration_date, status, verification_url, last_verified_date, document_url, notes, verified_by_user_id, created_at, updated_at")
    .eq("id", credId)
    .eq("clinic_id", userRecord.clinic_id)
    .single();

  if (!credential) notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Edit Credential — ${staff.name}`}
        description="Update the credential details below."
      />
      <div className="max-w-lg">
        <EditCredentialFormWrapper staffMemberId={id} credential={credential} />
      </div>
    </div>
  );
}
