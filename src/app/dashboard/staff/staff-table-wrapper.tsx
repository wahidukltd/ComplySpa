"use client";

import { useRouter } from "next/navigation";
import { StaffTable } from "@/components/staff/staff-table";
import { deleteStaffMember } from "@/lib/actions/staff";
import { toast } from "sonner";
import type { Tables } from "@/types/database";
import type { ReadinessResult } from "@/lib/staff/readiness";
import type { OnboardingStaffState } from "@/lib/staff/onboarding";

type StaffMember = Tables<"staff_members">;

export function StaffTableWrapper({
  staff,
  readinessMap = {},
  onboardingState = {},
  dataUnavailable = false,
  canEdit = true,
}: {
  staff: StaffMember[];
  readinessMap?: Record<string, ReadinessResult>;
  onboardingState?: Record<string, OnboardingStaffState>;
  dataUnavailable?: boolean;
  canEdit?: boolean;
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
      readinessMap={readinessMap}
      onboardingState={onboardingState}
      dataUnavailable={dataUnavailable}
      canEdit={canEdit}
    />
  );
}
