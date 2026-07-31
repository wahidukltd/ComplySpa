"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { syncStaffToTemplate } from "@/lib/actions/role-templates";
import { RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function SyncStaffToTemplateButton({ staffMemberId }: { staffMemberId: string }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);

  async function handleSync() {
    setSyncing(true);
    const result = await syncStaffToTemplate(staffMemberId);
    setSyncing(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`Synced to role template (${result.added ?? 0} item${(result.added ?? 0) === 1 ? "" : "s"} added).`);
    router.refresh();
  }

  return (
    <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing} className="gap-1.5">
      {syncing ? (
        <>
          <Loader2 className="size-3.5 animate-spin" />
          Syncing...
        </>
      ) : (
        <>
          <RefreshCw className="size-3.5" />
          Sync to role template
        </>
      )}
    </Button>
  );
}
