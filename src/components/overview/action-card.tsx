"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Info, ExternalLink } from "lucide-react";
import { verifyCredentialNow } from "@/lib/actions/credentials";
import { toast } from "sonner";
import type { ComplianceAction } from "@/lib/staff/compliance-actions";
import type { ActionUrgency } from "@/types";

const URGENCY_STYLES: Record<ActionUrgency, { border: string; bg: string; icon: "critical" | "warning" | "info" }> = {
  critical: { border: "border-destructive/30", bg: "bg-destructive/5", icon: "critical" },
  warning: { border: "border-[#C2853A]/30", bg: "bg-[#C2853A]/5", icon: "warning" },
  info: { border: "border-muted-foreground/20", bg: "bg-muted/20", icon: "info" },
};

function UrgencyIcon({ type }: { type: "critical" | "warning" | "info" }) {
  const label = type === "critical" ? "Critical" : type === "warning" ? "Warning" : "Info";
  if (type === "critical") {
    return <AlertTriangle className="size-5 shrink-0 text-destructive" aria-label={label} role="img" />;
  }
  if (type === "warning") {
    return <AlertTriangle className="size-5 shrink-0 text-[#C2853A]" aria-label={label} role="img" />;
  }
  return <Info className="size-5 shrink-0 text-muted-foreground" aria-label={label} role="img" />;
}

export function ActionCard({ action, canVerify = true }: { action: ComplianceAction; canVerify?: boolean }) {
  const router = useRouter();
  const urgencyStyle = URGENCY_STYLES[action.urgency];

  async function handleVerify() {
    if (!action.credentialId) return;
    const result = await verifyCredentialNow(action.credentialId);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(`${action.credentialName} verified`);
      router.refresh();
    }
  }

  return (
    <Card className={urgencyStyle.border}>
      <CardContent className="pt-4">
        <div className="flex items-start gap-3">
          <UrgencyIcon type={urgencyStyle.icon} />
          <div className="flex-1 min-w-0">
            <p className="font-medium">{action.staffName}</p>
            <p className="text-xs text-muted-foreground">
              {action.role}{action.role && action.credentialName ? " · " : ""}{action.credentialName}
            </p>
            <p className="mt-1 text-sm">{action.description}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{action.risk}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {action.actionType === "verify_recommended" && action.credentialId ? (
              canVerify ? (
                <Button variant="outline" size="sm" onClick={handleVerify} className="gap-1">
                  <ExternalLink className="size-3" />
                  Verify
                </Button>
              ) : null
            ) : (
              <Button
                variant={action.urgency === "critical" ? "default" : "secondary"}
                size="sm"
                onClick={() => router.push(action.actionHref)}
                className="gap-1"
              >
                {action.actionLabel}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
