"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { syncAllStaffOnboarding } from "@/lib/actions/onboarding";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function PopulateButton({ visible }: { visible: boolean }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  if (!visible) return null;

  async function handlePopulate() {
    setLoading(true);
    const result = await syncAllStaffOnboarding();
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(`Onboarding items created for ${result.count ?? 0} staff member(s).`);
      router.refresh();
    }
  }

  return (
    <Button variant="outline" onClick={handlePopulate} disabled={loading} className="gap-1.5">
      {loading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : null}
      Populate all
    </Button>
  );
}
