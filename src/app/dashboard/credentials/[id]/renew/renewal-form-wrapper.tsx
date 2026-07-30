"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { CredentialForm } from "@/components/staff/credential-form";
import { updateCredential } from "@/lib/actions/credentials";
import { toast } from "sonner";

interface BaseDefaults {
  credential_type_id: string;
  staff_member_id: string;
  license_number: string;
  state: string;
  verification_url: string;
  notes: string;
}

export function RenewalFormWrapper({
  credentialId,
  staffMemberId,
  renewalDays,
  baseDefaults,
}: {
  credentialId: string;
  staffMemberId: string;
  renewalDays: number | null | undefined;
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
    notes: [baseDefaults.notes, `[Renewed on ${today}]`].filter(Boolean).join("\n"),
  }), [baseDefaults, today, futureExpiry]);

  async function handleSubmit(data: Parameters<typeof updateCredential>[1]) {
    const result = await updateCredential(credentialId, data);
    if (!result.error) {
      toast.success("Credential renewed — status updated.");
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
    />
  );
}
