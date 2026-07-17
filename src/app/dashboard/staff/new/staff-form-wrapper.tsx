"use client";

import { useRouter } from "next/navigation";
import { StaffForm } from "@/components/staff/staff-form";
import { addStaffMember } from "@/lib/actions/staff";
import type { StaffMemberInput } from "@/lib/validations/staff";

export function StaffFormWrapper() {
  const router = useRouter();

  async function handleSubmit(data: StaffMemberInput) {
    const result = await addStaffMember(data);
    if (!result.error) {
      router.push("/dashboard/staff");
    }
    return result;
  }

  return <StaffForm onSubmit={handleSubmit} submitLabel="Add staff member" />;
}
