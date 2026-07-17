"use client";

import { useRouter } from "next/navigation";
import { StaffTable } from "@/components/staff/staff-table";
import { deleteStaffMember } from "@/lib/actions/staff";
import type { Tables } from "@/types/database";

type StaffMember = Tables<"staff_members">;

export function StaffTableWrapper({ staff }: { staff: StaffMember[] }) {
  const router = useRouter();

  async function handleDelete(id: string) {
    if (!confirm("Remove this staff member? This will also remove all their credentials.")) return;
    const result = await deleteStaffMember(id);
    if (result.error) {
      alert(result.error);
    } else {
      router.refresh();
    }
  }

  return <StaffTable staff={staff} onDelete={handleDelete} />;
}
