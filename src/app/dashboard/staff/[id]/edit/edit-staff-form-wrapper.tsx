"use client";

import { useRouter } from "next/navigation";
import { StaffForm } from "@/components/staff/staff-form";
import { updateStaffMember } from "@/lib/actions/staff";
import type { StaffMemberInput } from "@/lib/validations/staff";
import type { Tables } from "@/types/database";

type StaffMember = Tables<"staff_members">;

export function EditStaffFormWrapper({ staff }: { staff: StaffMember }) {
  const router = useRouter();

  async function handleSubmit(data: StaffMemberInput) {
    const result = await updateStaffMember(staff.id, data);
    if (!result.error) {
      router.push(`/dashboard/staff/${staff.id}`);
    }
    return result;
  }

  return (
    <StaffForm
      defaultValues={staff}
      onSubmit={handleSubmit}
      submitLabel="Save changes"
    />
  );
}
