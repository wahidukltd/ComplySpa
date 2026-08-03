"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CredentialForm } from "@/components/staff/credential-form";
import { addCredential } from "@/lib/actions/credentials";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface StaffOption {
  id: string;
  name: string;
  role: string | null;
}

export function NewCredentialWrapper({
  staffList,
  requestedStaffId,
}: {
  staffList: StaffOption[];
  requestedStaffId?: string;
}) {
  const router = useRouter();

  // Single-staff clinic: the "which staff member?" question disappears.
  const initialStaffId =
    requestedStaffId && staffList.some((s) => s.id === requestedStaffId)
      ? requestedStaffId
      : staffList.length === 1
        ? staffList[0]?.id
        : undefined;

  const [selectedStaffId, setSelectedStaffId] = useState<string | undefined>(initialStaffId);
  const [staffSearch, setStaffSearch] = useState("");

  const filteredStaff = useMemo(() => {
    if (!staffSearch) return staffList;
    const q = staffSearch.toLowerCase();
    return staffList.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.role ?? "").toLowerCase().includes(q),
    );
  }, [staffList, staffSearch]);

  // The selected staff member must stay selectable even when the search
  // filters them out, or Base UI falls back to rendering the raw UUID in the
  // trigger (the documented items-prop debt).
  const staffItems = useMemo(() => {
    const items = filteredStaff.map((s) => ({
      value: s.id,
      label: s.role ? `${s.name} — ${s.role}` : s.name,
    }));
    if (selectedStaffId && !filteredStaff.some((s) => s.id === selectedStaffId)) {
      const selected = staffList.find((s) => s.id === selectedStaffId);
      if (selected) {
        items.push({ value: selected.id, label: selected.role ? `${selected.name} — ${selected.role}` : selected.name });
      }
    }
    return items;
  }, [filteredStaff, staffList, selectedStaffId]);

  // The "which staff member?" question disappears for a single-staff clinic.
  const selectedStaff = staffList.find((s) => s.id === selectedStaffId);

  if (staffList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-10 text-center">
        <Users className="size-10 text-muted-foreground" />
        <h2 className="mt-4 text-lg font-semibold">No staff yet — create one first</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Credentials are attached to staff members. Create a staff member, then come back to add
          their credentials.
        </p>
        <Link href="/dashboard/staff" className={cn(buttonVariants({ variant: "default" }), "mt-5 gap-1.5")}>
          <Users className="size-4" />
          Create staff
        </Link>
      </div>
    );
  }

  async function handleSubmit(data: Parameters<typeof addCredential>[0]) {
    const result = await addCredential(data);
    if (!result.error && selectedStaff) {
      router.push(`/dashboard/staff/${selectedStaff.id}`);
    }
    return result;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="new-credential-staff">Staff member</Label>
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Search staff members..."
              value={staffSearch}
              onChange={(e) => setStaffSearch(e.target.value)}
              className="h-8 pl-8 text-sm"
            />
          </div>
          <Select
            value={selectedStaffId}
            onValueChange={(v) => v && setSelectedStaffId(v)}
            items={staffItems}
          >
            <SelectTrigger id="new-credential-staff">
              <SelectValue placeholder="Select a staff member" />
            </SelectTrigger>
            <SelectContent>
              {filteredStaff.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.role ? `${s.name} — ${s.role}` : s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          The credential will appear on this staff member&apos;s record and their compliance status.
        </p>
      </div>

      {selectedStaffId && (
        <CredentialForm
          key={selectedStaffId}
          staffMemberId={selectedStaffId}
          onSubmit={handleSubmit}
          submitLabel="Add credential"
        />
      )}
    </div>
  );
}
