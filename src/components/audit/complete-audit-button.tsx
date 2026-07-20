"use client";

import { useState, useTransition } from "react";
import { completeAudit } from "@/lib/actions/audit";
import { Button } from "@/components/ui/button";

export function CompleteAuditButton({ runId }: { runId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleComplete = () => {
    setError(null);
    startTransition(async () => {
      const result = await completeAudit(runId);
      if (result.error) setError(result.error);
    });
  };

  return (
    <div>
      <Button onClick={handleComplete} disabled={pending}>
        {pending ? "Completing..." : "Complete Audit & Calculate Score"}
      </Button>
      {error && (
        <p className="text-sm mt-2" style={{ color: "#B8443A" }}>{error}</p>
      )}
    </div>
  );
}
