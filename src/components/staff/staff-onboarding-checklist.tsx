"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { markOnboardingItemSkipped } from "@/lib/actions/onboarding";
import { CheckCircle2, Circle, MinusCircle, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

interface OnboardingItem {
  id: string;
  status: string;
  is_required: boolean;
  credential_type_id?: string;
  created_at?: string;
  credential_type: { name: string; category: string } | null;
}

interface OnboardingChecklistProps {
  items: OnboardingItem[];
  total: number;
  completed: number;
  staffMemberId?: string;
  requiredTotal?: number;
  requiredCompleted?: number;
  optionalTotal?: number;
  optionalCompleted?: number;
  blocked?: boolean;
  canEdit?: boolean;
}

function daysSince(dateStr: string): number {
  const created = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
}

export function OnboardingChecklist({
  items,
  requiredTotal = 0,
  requiredCompleted = 0,
  optionalTotal = 0,
  optionalCompleted = 0,
  blocked = false,
  staffMemberId,
  canEdit = false,
}: OnboardingChecklistProps) {
  const router = useRouter();
  const wasBlocked = useRef(blocked);
  const [optionalOpen, setOptionalOpen] = useState(false);

  useEffect(() => {
    if (wasBlocked.current && !blocked && requiredTotal > 0 && requiredCompleted === requiredTotal) {
      toast.success("All required items complete — ready to start!");
    }
    wasBlocked.current = blocked;
  }, [blocked, requiredTotal, requiredCompleted]);

  async function handleSkip(itemId: string) {
    const result = await markOnboardingItemSkipped(itemId);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Item skipped");
      router.refresh();
    }
  }

  function handleComplete(item: OnboardingItem) {
    if (!staffMemberId || !item.credential_type_id) return;
    router.push(`/dashboard/staff/${staffMemberId}/credentials/new?credentialTypeId=${item.credential_type_id}`);
  }

  if (items.length === 0) return null;

  const requiredItems = items.filter((i) => i.is_required);
  const optionalItems = items.filter((i) => !i.is_required);

  function renderItem(item: OnboardingItem) {
    const days = item.created_at ? daysSince(item.created_at) : 0;
    const isStale = days > 7;
    const isUrgent = days > 30;

    return (
      <div
        key={item.id}
        className={`flex items-center justify-between rounded-lg border p-3 ${item.is_required ? "" : "border-dashed"}`}
      >
        <div className="flex items-center gap-3">
          {item.status === "completed" ? (
            <CheckCircle2 className="size-4 shrink-0 text-[#4A8C5C]" />
          ) : item.status === "skipped" ? (
            <MinusCircle className="size-4 shrink-0 text-muted-foreground/50" />
          ) : (
            <Circle className={`size-4 shrink-0 ${item.is_required ? "text-muted-foreground" : "text-muted-foreground/50"}`} />
          )}
          <div>
            <div className="flex items-center gap-2">
              <p className={`text-sm font-medium ${item.status === "skipped" ? "text-muted-foreground/60 line-through" : ""}`}>
                {item.credential_type?.name ?? "Credential"}
              </p>
              <Badge
                variant={item.is_required ? "default" : "outline"}
                className={`text-[10px] ${item.is_required ? "" : "text-muted-foreground"}`}
              >
                {item.is_required ? "Required" : "Optional"}
              </Badge>
              {item.status === "pending" && isUrgent && (
                <span className="text-[10px] font-medium text-destructive">{days}d pending</span>
              )}
              {item.status === "pending" && isStale && !isUrgent && (
                <span className="text-[10px] font-medium text-[#C2853A]">{days}d pending</span>
              )}
            </div>
            {item.credential_type?.category && (
              <Badge variant="outline" className="mt-0.5 text-[10px]">
                {item.credential_type.category}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {item.status === "pending" && (
            <>
              {canEdit && item.credential_type_id && (
                <button
                  type="button"
                  onClick={() => handleComplete(item)}
                  className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                >
                  Complete
                </button>
              )}
              {canEdit && !item.is_required && (
                <button
                  type="button"
                  onClick={() => handleSkip(item.id)}
                  className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
                >
                  Not needed
                </button>
              )}
            </>
          )}
          {item.status === "skipped" && item.is_required && (
            <>
              {canEdit && item.credential_type_id ? (
                <button
                  type="button"
                  onClick={() => handleComplete(item)}
                  className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                >
                  Complete
                </button>
              ) : (
                <span className="text-xs text-muted-foreground/60">Skipped</span>
              )}
            </>
          )}
          {item.status === "skipped" && !item.is_required && (
            <span className="text-xs text-muted-foreground/60">Skipped</span>
          )}
          {item.status === "completed" && (
            <span className="text-xs text-[#4A8C5C]">Completed</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card id="onboarding">
      <CardContent className="pt-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            {requiredTotal > 0
              ? `Getting work-ready — ${requiredCompleted} of ${requiredTotal} required`
              : "Getting Work Ready"}
          </h3>
        </div>

        {requiredTotal > 0 && (
          <div className="mb-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Required — {requiredCompleted} of {requiredTotal}
              </span>
              <span className="text-xs text-muted-foreground">
                {requiredTotal > 0 ? Math.round((requiredCompleted / requiredTotal) * 100) : 0}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{
                  width: `${requiredTotal > 0 ? Math.round((requiredCompleted / requiredTotal) * 100) : 0}%`,
                }}
              />
            </div>
          </div>
        )}

        {optionalTotal > 0 && (
          <div className="mb-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Optional — {optionalCompleted} of {optionalTotal}
              </span>
              <span className="text-xs text-muted-foreground">
                {optionalTotal > 0 ? Math.round((optionalCompleted / optionalTotal) * 100) : 0}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-muted-foreground/40 transition-all"
                style={{
                  width: `${optionalTotal > 0 ? Math.round((optionalCompleted / optionalTotal) * 100) : 0}%`,
                }}
              />
            </div>
          </div>
        )}

        {!blocked && requiredTotal > 0 && requiredCompleted === requiredTotal && (
          <div className="mb-3 rounded-md bg-[#E8F2EB] p-3 text-sm text-[#2D5C3A]">
            <CheckCircle2 className="mr-1.5 inline size-4" />
            Ready to start — all required onboarding requirements addressed.
            {optionalTotal > 0 && optionalCompleted < optionalTotal && (
              <span className="ml-1 text-muted-foreground">
                ({optionalTotal - optionalCompleted} optional item{optionalTotal - optionalCompleted !== 1 ? "s" : ""} remaining)
              </span>
            )}
          </div>
        )}

        {blocked && (
          <div className="mb-3 rounded-md bg-[#FCE8E5] p-3 text-sm text-[#7A2A26]">
            <AlertTriangle className="mr-1.5 inline size-4" />
            Cannot start — missing required items.
          </div>
        )}

        <div className="space-y-2">
          {requiredItems.map(renderItem)}
        </div>

        {optionalItems.length > 0 && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setOptionalOpen(!optionalOpen)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {optionalOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              Optional items ({optionalCompleted}/{optionalTotal})
            </button>
            {optionalOpen && (
              <div className="mt-2 space-y-2">
                {optionalItems.map(renderItem)}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
