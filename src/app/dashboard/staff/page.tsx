import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { StaffTableWrapper } from "./staff-table-wrapper";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function StaffListPage() {
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
    .select("id, clinic_id, name, role, hire_date, email, phone, procedures_performed, deleted_at, created_at, updated_at")
    .eq("clinic_id", userRecord.clinic_id)
    .is("deleted_at", null)
    .order("name");

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

      <StaffTableWrapper staff={staff ?? []} />
    </div>
  );
}
