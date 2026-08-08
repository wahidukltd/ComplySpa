"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StaffTable } from "@/components/staff/staff-table";
import { deleteStaffMember } from "@/lib/actions/staff";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
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
  roleOptions,
}: {
  staff: StaffMember[];
  readinessMap?: Record<string, ReadinessResult>;
  onboardingState?: Record<string, OnboardingStaffState>;
  dataUnavailable?: boolean;
  canEdit?: boolean;
  roleOptions?: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [pendingDelete, setPendingDelete] = useState<StaffMember | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const result = await deleteStaffMember(pendingDelete.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Staff member removed");
      router.refresh();
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  }

  return (
    <>
      <StaffTable
        staff={staff}
        onDelete={(id) => setPendingDelete(staff.find((s) => s.id === id) ?? null)}
        readinessMap={readinessMap}
        onboardingState={onboardingState}
        dataUnavailable={dataUnavailable}
        canEdit={canEdit}
        roleOptions={roleOptions}
      />

      <Dialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            {pendingDelete && <DialogTitle>Remove {pendingDelete.name}?</DialogTitle>}
            <DialogDescription>
              They&apos;ll be removed from your roster immediately. Their credential records stay on file — you can
              add this person back at any time. This can&apos;t be undone from this screen.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={deleting}>Keep them</Button>} />
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? <Loader2 className="size-4 animate-spin" /> : null}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
