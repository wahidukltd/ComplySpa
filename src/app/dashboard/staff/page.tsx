import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { StaffTableWrapper } from "./staff-table-wrapper";
import { cn } from "@/lib/utils";
import { getStaffReadinessBulk } from "@/lib/staff/readiness";
import type { Tables } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function StaffListPage() {
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
    .select("id, clinic_id, name, role, hire_date, email, phone, procedures_performed, deleted_at, created_at, updated_at")
    .eq("clinic_id", userRecord.clinic_id)
    .is("deleted_at", null)
    .is("suspended_at", null)
    .order("name");

  const staffIds = (staff ?? []).map((s) => s.id);

  const readinessMap = await getStaffReadinessBulk(staffIds);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Staff"
        description="Manage your clinic's staff members."
      >
        <Link href="/dashboard/staff/new" className={cn(buttonVariants({ variant: "default" }), "gap-1.5")}>
          <Plus className="size-4" />
          Add staff
        </Link>
      </PageHeader>

      <StaffTableWrapper
        staff={(staff ?? []) as Tables<"staff_members">[]}
        readinessMap={readinessMap}
      />
    </div>
  );
}
