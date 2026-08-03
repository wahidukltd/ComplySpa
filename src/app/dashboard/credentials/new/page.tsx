import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { NewCredentialWrapper } from "./new-credential-wrapper";

export const dynamic = "force-dynamic";

export default async function NewCredentialPage({
  searchParams,
}: {
  searchParams?: Promise<{ staffId?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const requestedStaffId = resolvedSearchParams.staffId;

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

  // Viewers cannot create credentials; the action layer also gates, but the
  // page must not render a form that can never save (staff-edit pattern).
  if (userRecord.role === "viewer") notFound();

  const { data: staffRows } = await supabase
    .from("staff_members")
    .select("id, name, role")
    .eq("clinic_id", userRecord.clinic_id)
    .is("deleted_at", null)
    .is("suspended_at", null)
    .order("name");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Add Credential"
        description="Choose the staff member, then enter the credential details."
      />
      <div className="max-w-lg">
        <NewCredentialWrapper
          staffList={staffRows ?? []}
          requestedStaffId={requestedStaffId}
        />
      </div>
    </div>
  );
}
