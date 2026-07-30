"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { verifyCredentialNow, deleteCredential } from "@/lib/actions/credentials";
import { ExternalLink, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface CredentialActionsProps {
  credentialId: string;
  staffMemberId: string;
  verificationUrl: string | null;
  status: string;
}

export function CredentialActions({ credentialId, staffMemberId, verificationUrl, status }: CredentialActionsProps) {
  const router = useRouter();

  async function handleVerify() {
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
  }

  async function handleDelete() {
    if (!confirm("Delete this credential? This action cannot be undone.")) return;
    const result = await deleteCredential(credentialId, staffMemberId);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Credential deleted");
      router.push(`/dashboard/staff/${staffMemberId}`);
    }
  }

  return (
    <div className="flex gap-2">
      {status !== "valid" && (
        <Button
          variant={status === "expired" ? "default" : "secondary"}
          onClick={() => router.push(`/dashboard/credentials/${credentialId}/renew`)}
          className="gap-1.5"
        >
          <RefreshCw className="size-4" />
          Renew
        </Button>
      )}
      {verificationUrl && (
        <Button variant="outline" onClick={handleVerify} className="gap-1.5">
          <ExternalLink className="size-4" />
          Verify Now
        </Button>
      )}
      <Button
        variant="outline"
        onClick={() => router.push(`/dashboard/staff/${staffMemberId}/credentials/${credentialId}/edit`)}
      >
        Edit
      </Button>
      <Button variant="destructive" onClick={handleDelete} className="gap-1.5">
        <Trash2 className="size-4" />
        Delete
      </Button>
    </div>
  );
}
