"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { markOnboardingItemComplete, markOnboardingItemSkipped } from "@/lib/actions/onboarding";
import { CheckCircle2, Circle, MinusCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface OnboardingItem {
  id: string;
  status: string;
  is_required: boolean;
  credential_type: { name: string; category: string } | null;
}

interface OnboardingChecklistProps {
  items: OnboardingItem[];
  total: number;
  completed: number;
  requiredTotal?: number;
  requiredCompleted?: number;
  optionalTotal?: number;
  optionalCompleted?: number;
  blocked?: boolean;
}

export function OnboardingChecklist({
  items,
  requiredTotal = 0,
  requiredCompleted = 0,
  optionalTotal = 0,
  optionalCompleted = 0,
  blocked = false,
}: OnboardingChecklistProps) {
  const router = useRouter();

  async function handleComplete(itemId: string) {
    const result = await markOnboardingItemComplete(itemId);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Item marked as complete");
      router.refresh();
    }
  }

  async function handleSkip(itemId: string) {
    const result = await markOnboardingItemSkipped(itemId);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Item skipped");
      router.refresh();
    }
  }

  if (items.length === 0) return null;

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Onboarding Progress</h3>
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
          {items.map((item) => (
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
                    <button
                      type="button"
                      onClick={() => handleComplete(item.id)}
                      className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                    >
                      Complete
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSkip(item.id)}
                      className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
                    >
                      {item.is_required ? "Skip" : "Not needed"}
                    </button>
                  </>
                )}
                {item.status === "completed" && (
                  <span className="text-xs text-[#4A8C5C]">Completed</span>
                )}
                {item.status === "skipped" && (
                  <span className="text-xs text-muted-foreground/60">Skipped</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
