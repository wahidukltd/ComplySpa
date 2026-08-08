"use client";

import { useRouter } from "next/navigation";
import { StaffForm } from "@/components/staff/staff-form";
import { updateStaffMember } from "@/lib/actions/staff";
import { toast } from "sonner";
import type { StaffMemberInput } from "@/lib/validations/staff";
import type { Tables } from "@/types/database";

type StaffMember = Tables<"staff_members">;

export function EditStaffFormWrapper({
  staff,
  roleOptions,
}: {
  staff: StaffMember;
  roleOptions?: { value: string; label: string }[];
}) {
  const router = useRouter();

  async function handleSubmit(data: StaffMemberInput) {
    const result = await updateStaffMember(staff.id, data);
    if (result.error) {
      // Never silent (review 2026-08-03): validation errors carry fieldErrors
      // and render inline; bare errors — the D11 recovery error, the role-clear
      // guard, plan limits — must surface as a toast, not vanish.
      if (!result.fieldErrors || Object.keys(result.fieldErrors).length === 0) {
        toast.error(result.error);
      }
      return result;
    }
    // D12 echo: after a role change the toast confirms the regeneration
    // counts the preview card promised (actual numbers from the action).
    if ("added" in result && "removed" in result) {
      const parts: string[] = [];
      if ((result.added ?? 0) > 0) {
        parts.push(`${result.added ?? 0} requirement${(result.added ?? 0) === 1 ? "" : "s"} added`);
      }
      if ((result.removed ?? 0) > 0) {
        parts.push(`${result.removed ?? 0} removed`);
      }
      toast.success(parts.length > 0 ? `Role updated — ${parts.join(", ")}.` : "Role updated.");
    }
    router.push(`/dashboard/staff/${staff.id}`);
    return result;
  }

  return (
    <StaffForm
      defaultValues={staff}
      onSubmit={handleSubmit}
      submitLabel="Save changes"
      staffMemberId={staff.id}
      roleOptions={roleOptions}
    />
  );
}
