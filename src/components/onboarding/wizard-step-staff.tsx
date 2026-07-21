"use client";

import { useState, useCallback } from "react";
import { addStaffMember } from "@/lib/actions/staff";
import type { StaffMemberInput } from "@/lib/validations/staff";
import { tempId as genId } from "@/lib/utils/id";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, UserPlus, X, Check, Users } from "lucide-react";

const ROLE_OPTIONS = [
  { value: "", label: "Select role (optional)" },
  { value: "RN", label: "Registered Nurse" },
  { value: "NP", label: "Nurse Practitioner" },
  { value: "PA", label: "Physician Assistant" },
  { value: "MD", label: "Medical Doctor" },
  { value: "DO", label: "Doctor of Osteopathy" },
  { value: "esthetician", label: "Esthetician" },
  { value: "MA", label: "Medical Assistant" },
  { value: "other", label: "Other" },
];

interface StaffRow {
  tempId: string;
  name: string;
  role: string;
}

export function WizardStepStaff({
  onNext,
  onBack,
}: {
  onNext: (staff: Array<{ id: string; name: string }>) => void;
  onBack: () => void;
}) {
  const [rows, setRows] = useState<StaffRow[]>([
    { tempId: genId(), name: "", role: "" },
  ]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [savedStaff, setSavedStaff] = useState<Array<{ id: string; name: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const updateRow = useCallback((tempId: string, field: keyof StaffRow, value: string) => {
    setRows((prev) => prev.map((r) => (r.tempId === tempId ? { ...r, [field]: value } : r)));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[tempId];
      return next;
    });
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, { tempId: genId(), name: "", role: "" }]);
  }, []);

  const removeRow = useCallback((tempId: string) => {
    setRows((prev) => prev.filter((r) => r.tempId !== tempId));
  }, []);

  async function handleContinue() {
    setLastError(null);
    const newErrors: Record<string, string> = {};
    for (const row of rows) {
      if (!row.name.trim()) {
        newErrors[row.tempId] = "Name is required";
      }
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSaving(true);
    const saved: Array<{ id: string; name: string }> = [];
    let failedCount = 0;
    for (const row of rows) {
      if (saved.some(s => s.name === row.name.trim())) continue;
      const result = await addStaffMember({ name: row.name.trim(), role: (row.role || undefined) as StaffMemberInput["role"] });
      if (result.error) {
        failedCount++;
      }
      if (result.id) {
        saved.push({ id: result.id, name: row.name.trim() });
      }
    }
    setSavedStaff(saved);
    setSaving(false);
    if (failedCount > 0) {
      setLastError(
        `${failedCount} staff member(s) could not be saved. ${saved.length} saved successfully. You can add more later from your dashboard.`
      );
    } else {
      onNext(saved);
    }
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader className="text-center">
        <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full" style={{ backgroundColor: "#F6E3D6" }}>
          <Users className="size-5" style={{ color: "#9C6B5D" }} />
        </div>
        <CardTitle className="text-xl" style={{ color: "#3D2A25" }}>Add staff members</CardTitle>
        <CardDescription style={{ color: "#8B7D78" }}>
          Add the staff who will have credentials tracked. You can add more later.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((row) => (
          <div key={row.tempId} className="flex items-start gap-3">
            <div className="flex-1 space-y-1">
              <Label htmlFor={`name-${row.tempId}`} className="sr-only">Name</Label>
              <Input
                id={`name-${row.tempId}`}
                placeholder="Full name"
                value={row.name}
                onChange={(e) => updateRow(row.tempId, "name", e.target.value)}
                aria-invalid={!!errors[row.tempId]}
              />
              {errors[row.tempId] && (
                <p className="text-xs" style={{ color: "#B8443A" }}>{errors[row.tempId]}</p>
              )}
            </div>
            <div className="w-36">
              <Label htmlFor={`role-${row.tempId}`} className="sr-only">Role</Label>
              <select
                id={`role-${row.tempId}`}
                value={row.role}
                onChange={(e) => updateRow(row.tempId, "role", e.target.value)}
                className="flex h-10 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2"
                style={{
                  borderColor: "#D9B7A7",
                  color: "#3D2A25",
                  backgroundColor: "#FFFFFF",
                }}
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            {rows.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mt-1 shrink-0"
                onClick={() => removeRow(row.tempId)}
                aria-label="Remove staff member"
              >
                <X className="size-4" style={{ color: "#8B7D78" }} />
              </Button>
            )}
          </div>
        ))}

        <Button type="button" variant="outline" size="sm" onClick={addRow}
          style={{ borderColor: "#D9B7A7", color: "#9C6B5D" }}
        >
          <UserPlus className="mr-2 size-4" />
          Add another
        </Button>

        {lastError && (
          <div className="rounded-md p-3 text-sm" style={{ backgroundColor: "#FCE8E5", color: "#7A2A26" }}>
            {lastError}
          </div>
        )}

        {savedStaff.length > 0 && (
          <div className="rounded-md p-3 text-sm space-y-1" style={{ backgroundColor: "#E8F2EB", color: "#2D5C3A" }}>
            <p className="font-medium"><Check className="mr-1 inline size-4" />{savedStaff.length} staff member{savedStaff.length !== 1 ? "s" : ""} saved</p>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onBack}
            style={{ borderColor: "#D9B7A7", color: "#3D2A25" }}
          >
            Back
          </Button>
          <Button type="button" onClick={handleContinue} disabled={saving} className="flex-1">
            {saving ? <><Loader2 className="mr-2 size-4 animate-spin" /> Saving...</> : "Continue"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => onNext([])}
            style={{ color: "#8B7D78" }}
          >
            Skip
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
