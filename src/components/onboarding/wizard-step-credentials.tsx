"use client";

import { useState, useEffect, useCallback } from "react";
import { addCredential } from "@/lib/actions/credentials";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Plus, X, Check, ShieldCheck } from "lucide-react";
import { tempId as genId } from "@/lib/utils/id";

interface StaffRef {
  id: string;
  name: string;
}

interface CredentialRow {
  tempId: string;
  staffMemberId: string;
  credentialTypeId: string;
  licenseNumber: string;
  expirationDate: string;
}

interface CredentialType {
  id: string;
  name: string;
  category: string;
}

interface WizardStepCredentialsProps {
  staffMembers: StaffRef[];
  onNext: (credentialCount: number) => void;
  onBack: () => void;
}

export function WizardStepCredentials({ staffMembers, onNext, onBack }: WizardStepCredentialsProps) {
  const [credentialTypes, setCredentialTypes] = useState<CredentialType[]>([]);
  const [rows, setRows] = useState<CredentialRow[]>([{
    tempId: genId(),
    staffMemberId: staffMembers[0]?.id ?? "",
    credentialTypeId: "",
    licenseNumber: "",
    expirationDate: "",
  }]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("credential_types")
      .select("id, name, category")
      .is("clinic_id", null)
      .order("category")
      .then(({ data }) => {
        if (data) setCredentialTypes(data);
      });
  }, []);

  const updateRow = useCallback((tempId: string, field: keyof CredentialRow, value: string) => {
    setRows((prev) => prev.map((r) => (r.tempId === tempId ? { ...r, [field]: value } : r)));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[`${tempId}-${field}`];
      return next;
    });
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, {
      tempId: genId(),
      staffMemberId: staffMembers[0]?.id ?? "",
      credentialTypeId: "",
      licenseNumber: "",
      expirationDate: "",
    }]);
  }, [staffMembers]);

  const removeRow = useCallback((tempId: string) => {
    setRows((prev) => prev.filter((r) => r.tempId !== tempId));
  }, []);

  async function handleContinue() {
    setLastError(null);
    const newErrors: Record<string, string> = {};
    for (const row of rows) {
      if (!row.credentialTypeId) {
        newErrors[`${row.tempId}-credentialTypeId`] = "Select a type";
      }
      if (!row.staffMemberId) {
        newErrors[`${row.tempId}-staffMemberId`] = "Select a staff member";
      }
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSaving(true);
    let count = 0;
    let failedCount = 0;
    for (const row of rows) {
      const result = await addCredential({
        staff_member_id: row.staffMemberId,
        credential_type_id: row.credentialTypeId,
        license_number: row.licenseNumber || undefined,
        expiration_date: row.expirationDate || undefined,
      });
      if (result.error) {
        failedCount++;
      } else {
        count++;
      }
    }
    setSavedCount(count);
    setSaving(false);
    if (failedCount > 0) {
      setLastError(`${failedCount} credential(s) could not be saved. ${count} saved successfully. You can add more later from your dashboard.`);
    } else {
      onNext(count);
    }
  }

  if (staffMembers.length === 0) {
    return (
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-[#F0F4F5]">
            <ShieldCheck className="size-5 text-[#6E97A7]" />
          </div>
          <CardTitle className="text-xl text-black">Add credentials</CardTitle>
          <CardDescription className="text-[rgba(0,0,0,0.55)]">
            No staff members to add credentials for. You can add credentials later from your dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onBack}
              className="border-[rgba(0,0,0,0.12)] text-black"
            >
              Back
            </Button>
            <Button type="button" onClick={() => onNext(0)} className="flex-1">
              Continue
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader className="text-center">
        <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-[#F0F4F5]">
          <ShieldCheck className="size-5 text-[#6E97A7]" />
        </div>
        <CardTitle className="text-xl text-black">Add credentials</CardTitle>
        <CardDescription className="text-[rgba(0,0,0,0.55)]">
          Enter license and certification details. You can add more later.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((row) => (
          <div key={row.tempId} className="rounded-lg border border-[rgba(0,0,0,0.12)] p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex-1 space-y-1">
                <Label htmlFor={`staff-${row.tempId}`}>Staff member</Label>
                <select
                  id={`staff-${row.tempId}`}
                  value={row.staffMemberId}
                  onChange={(e) => updateRow(row.tempId, "staffMemberId", e.target.value)}
                  className={`flex h-10 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${errors[`${row.tempId}-staffMemberId`] ? "border-[#B8443A]" : "border-[rgba(0,0,0,0.12)]"} text-black bg-white`}
                >
                  <option value="">Select staff member</option>
                  {staffMembers.map((sm) => (
                    <option key={sm.id} value={sm.id}>{sm.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 space-y-1">
                <Label htmlFor={`type-${row.tempId}`}>Credential type</Label>
                <select
                  id={`type-${row.tempId}`}
                  value={row.credentialTypeId}
                  onChange={(e) => updateRow(row.tempId, "credentialTypeId", e.target.value)}
                  className={`flex h-10 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${errors[`${row.tempId}-credentialTypeId`] ? "border-[#B8443A]" : "border-[rgba(0,0,0,0.12)]"} text-black bg-white`}
                >
                  <option value="">Select type</option>
                  {credentialTypes.map((ct) => (
                    <option key={ct.id} value={ct.id}>{ct.name}</option>
                  ))}
                </select>
              </div>
              {rows.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mt-6 shrink-0"
                  onClick={() => removeRow(row.tempId)}
                  aria-label="Remove credential"
                >
                  <X className="size-4 text-[rgba(0,0,0,0.55)]" />
                </Button>
              )}
            </div>

            <div className="flex gap-3">
              <div className="flex-1 space-y-1">
                <Label htmlFor={`license-${row.tempId}`}>License number (optional)</Label>
                <Input
                  id={`license-${row.tempId}`}
                  placeholder="e.g. RN-12345"
                  value={row.licenseNumber}
                  onChange={(e) => updateRow(row.tempId, "licenseNumber", e.target.value)}
                />
              </div>
              <div className="w-40 space-y-1">
                <Label htmlFor={`exp-${row.tempId}`}>Expiration (optional)</Label>
                <Input
                  id={`exp-${row.tempId}`}
                  type="date"
                  value={row.expirationDate}
                  onChange={(e) => updateRow(row.tempId, "expirationDate", e.target.value)}
                />
              </div>
            </div>
          </div>
        ))}

        <Button type="button" variant="outline" size="sm" onClick={addRow}
          className="border-[rgba(0,0,0,0.12)] text-[#6E97A7]"
        >
          <Plus className="mr-2 size-4" />
          Add another credential
        </Button>

        {lastError && (
          <div className="rounded-md p-3 text-sm bg-[#FCE8E5] text-[#7A2A26]">
            {lastError}
          </div>
        )}

        {savedCount > 0 && (
          <div className="rounded-md p-3 text-sm bg-[#E8F2EB] text-[#2D5C3A]">
            <p className="font-medium"><Check className="mr-1 inline size-4" />{savedCount} credential{savedCount !== 1 ? "s" : ""} saved</p>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onBack}
            className="border-[rgba(0,0,0,0.12)] text-black"
          >
            Back
          </Button>
          <Button type="button" onClick={handleContinue} disabled={saving} className="flex-1">
            {saving ? <><Loader2 className="mr-2 size-4 animate-spin" /> Saving...</> : "Continue"}
          </Button>
          {rows.length > 0 && (
            <Button type="button" variant="ghost" onClick={() => onNext(0)}
              className="text-[rgba(0,0,0,0.55)]"
            >
              Skip
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
