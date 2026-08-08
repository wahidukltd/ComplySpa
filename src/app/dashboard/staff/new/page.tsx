import { redirect, notFound } from "next/navigation";
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
    .select("clinic_id, role")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (userErr || !userRecord) redirect("/onboarding");

  // Viewers cannot create staff; the action layer also gates, but the page
  // must not render a form that can never save (staff-edit pattern).
  if (userRecord.role === "viewer") notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Add Staff Member" description="Enter the staff member's details below." />
      <div className="max-w-2xl">
        <StaffFormWrapper />
      </div>
    </div>
  );
}

