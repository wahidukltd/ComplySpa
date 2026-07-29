import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { NewCredentialFormWrapper } from "./credential-form-wrapper";

export const dynamic = "force-dynamic";

export default async function NewCredentialPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ credentialTypeId?: string }>;
}) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const credentialTypeId = resolvedSearchParams.credentialTypeId;

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
    .select("name")
    .eq("id", id)
    .eq("clinic_id", userRecord.clinic_id)
    .is("deleted_at", null)
    .is("suspended_at", null)
    .single();

  if (!staff) notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Add Credential — ${staff.name}`}
        description="Enter the credential details below."
      />
      <div className="max-w-lg">
        <NewCredentialFormWrapper staffMemberId={id} credentialTypeId={credentialTypeId} />
      </div>
    </div>
  );
}
