"use client";

import { useRouter } from "next/navigation";
import { CredentialForm } from "@/components/staff/credential-form";
import { updateCredential } from "@/lib/actions/credentials";
import type { Tables } from "@/types/database";

type Credential = Tables<"credentials">;

export function EditCredentialFormWrapper({
  staffMemberId,
  credential,
}: {
  staffMemberId: string;
  credential: Credential;
}) {
  const router = useRouter();

  async function handleSubmit(data: Parameters<typeof updateCredential>[1]) {
    const result = await updateCredential(credential.id, data);
    if (!result.error) {
      router.push(`/dashboard/staff/${staffMemberId}`);
    }
    return result;
  }

  return (
    <CredentialForm
      staffMemberId={staffMemberId}
      defaultValues={credential}
      onSubmit={handleSubmit}
      submitLabel="Save changes"
    />
  );
}
