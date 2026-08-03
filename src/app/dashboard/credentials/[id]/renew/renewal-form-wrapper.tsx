"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { CredentialForm } from "@/components/staff/credential-form";
import { renewCredential } from "@/lib/actions/credentials";
import { toast } from "sonner";

interface BaseDefaults {
  credential_type_id: string;
  staff_member_id: string;
  license_number: string;
  state: string;
  verification_url: string;
  notes: string;
  document_url?: string | null;
}

export function RenewalFormWrapper({
  credentialId,
  staffMemberId,
  renewalDays,
  typeName,
  baseDefaults,
}: {
  credentialId: string;
  staffMemberId: string;
  renewalDays: number | null | undefined;
  typeName: string;
  baseDefaults: BaseDefaults;
}) {
  const router = useRouter();
  const [today] = useState(() => new Date().toISOString().split("T")[0] ?? "");
  const [futureExpiry] = useState(() =>
    renewalDays && renewalDays > 0
      ? (new Date(Date.now() + renewalDays * 86400000).toISOString().split("T")[0] ?? "")
      : ""
  );

  const defaultValues = useMemo(() => ({
    ...baseDefaults,
    issue_date: today,
    expiration_date: futureExpiry,
    // Notes are NOT polluted with "[Renewed on ...]" — credential_audit is the
    // official history (owner decision 2026-08-04).
    notes: baseDefaults.notes,
    document_url: baseDefaults.document_url ?? null,
  }), [baseDefaults, today, futureExpiry]);

  async function handleSubmit(data: Parameters<typeof renewCredential>[1]) {
    const result = await renewCredential(credentialId, data);
    if (!result.error) {
      toast.success("Credential renewed — dates updated.");
      router.push(`/dashboard/credentials/${credentialId}`);
    }
    return result;
  }

  return (
    <CredentialForm
      staffMemberId={staffMemberId}
      defaultValues={defaultValues}
      onSubmit={handleSubmit}
      submitLabel="Renew credential"
      lockType
      lockTypeLabel={typeName}
    />
  );
}
