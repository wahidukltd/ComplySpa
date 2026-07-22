import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { StaffFormWrapper } from "./staff-form-wrapper";

export const dynamic = "force-dynamic";

export default async function NewStaffPage() {
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Add Staff Member" description="Enter the staff member's details below." />
      <div className="max-w-lg">
        <StaffFormWrapper />
      </div>
    </div>
  );
}
