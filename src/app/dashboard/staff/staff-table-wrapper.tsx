"use client";

import { useRouter } from "next/navigation";
import { StaffTable } from "@/components/staff/staff-table";
import { deleteStaffMember } from "@/lib/actions/staff";
import { toast } from "sonner";
import type { Tables } from "@/types/database";

type StaffMember = Tables<"staff_members">;

export function StaffTableWrapper({
  staff,
  credStatusMap = {},
  onboardingStatusMap = {},
}: {
  staff: StaffMember[];
  credStatusMap?: Record<string, "valid" | "expiring" | "expired" | "none">;
  onboardingStatusMap?: Record<string, { total: number; completed: number }>;
}) {
  const router = useRouter();

  async function handleDelete(id: string) {
    const result = await deleteStaffMember(id);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Staff member removed");
      router.refresh();
    }
  }

  return (
    <StaffTable
      staff={staff}
      onDelete={handleDelete}
      credStatusMap={credStatusMap}
      onboardingStatusMap={onboardingStatusMap}
    />
  );
}
