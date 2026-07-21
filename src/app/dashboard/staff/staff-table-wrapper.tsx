"use client";

import { useRouter } from "next/navigation";
import { StaffTable } from "@/components/staff/staff-table";
import { deleteStaffMember } from "@/lib/actions/staff";
import { toast } from "sonner";
import type { Tables } from "@/types/database";

type StaffMember = Tables<"staff_members">;

export function StaffTableWrapper({ staff }: { staff: StaffMember[] }) {
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

  return <StaffTable staff={staff} onDelete={handleDelete} />;
}
