"use client";

import { useRouter } from "next/navigation";
import { CredentialForm } from "@/components/staff/credential-form";
import { addCredential } from "@/lib/actions/credentials";
import type { Tables } from "@/types/database";

type Credential = Tables<"credentials">;

export function NewCredentialFormWrapper({
  staffMemberId,
  credentialTypeId,
}: {
  staffMemberId: string;
  credentialTypeId?: string;
}) {
  const router = useRouter();

  async function handleSubmit(data: Parameters<typeof addCredential>[0]) {
    const result = await addCredential(data);
    if (!result.error) {
      router.push(`/dashboard/staff/${staffMemberId}`);
    }
    return result;
  }

  return (
    <CredentialForm
      staffMemberId={staffMemberId}
      onSubmit={handleSubmit}
      submitLabel="Add credential"
      defaultValues={
        credentialTypeId
          ? ({ credential_type_id: credentialTypeId } as Partial<Credential>)
          : undefined
      }
    />
  );
}
