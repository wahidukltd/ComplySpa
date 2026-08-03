"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { verifyCredentialNow, deleteCredential } from "@/lib/actions/credentials";
import { ExternalLink, Trash2, RefreshCw, Pencil } from "lucide-react";
import { toast } from "sonner";

interface CredentialActionsProps {
  credentialId: string;
  staffMemberId: string;
  verificationUrl: string | null;
  status: string;
  canEdit: boolean;
}

export function CredentialActions({
  credentialId,
  staffMemberId,
  verificationUrl,
  status,
  canEdit,
}: CredentialActionsProps) {
  const router = useRouter();
  const [verifying, setVerifying] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleVerify() {
    setVerifying(true);
    try {
      if (verificationUrl) {
        window.open(verificationUrl, "_blank");
      }
      const result = await verifyCredentialNow(credentialId);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Credential verified");
        router.refresh();
      }
    } finally {
      setVerifying(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this credential? This action cannot be undone.")) return;
    setDeleting(true);
    try {
      const result = await deleteCredential(credentialId, staffMemberId);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Credential deleted");
        router.push(`/dashboard/staff/${staffMemberId}`);
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {canEdit && status !== "valid" && (
        <Button
          variant={status === "expired" ? "default" : "secondary"}
          onClick={() => router.push(`/dashboard/credentials/${credentialId}/renew`)}
          className="gap-1.5"
        >
          <RefreshCw className="size-4" />
          Renew
        </Button>
      )}
      {canEdit && verificationUrl && (
        <Button variant="outline" onClick={handleVerify} disabled={verifying} className="gap-1.5">
          <ExternalLink className="size-4" />
          {verifying ? "Verifying..." : "Verify Now"}
        </Button>
      )}
      {canEdit && (
        <Button
          variant="outline"
          onClick={() => router.push(`/dashboard/staff/${staffMemberId}/credentials/${credentialId}/edit`)}
          className="gap-1.5"
        >
          <Pencil className="size-4" />
          Edit
        </Button>
      )}
      {canEdit && (
        <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="gap-1.5">
          <Trash2 className="size-4" />
          Delete
        </Button>
      )}
    </div>
  );
}
