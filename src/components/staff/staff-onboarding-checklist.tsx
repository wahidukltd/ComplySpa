"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { markOnboardingItemComplete, markOnboardingItemSkipped } from "@/lib/actions/onboarding";
import { CheckCircle2, Circle, MinusCircle } from "lucide-react";
import { toast } from "sonner";

interface OnboardingItem {
  id: string;
  status: string;
  credential_type: { name: string; category: string } | null;
}

interface OnboardingChecklistProps {
  items: OnboardingItem[];
  total: number;
  completed: number;
}

export function OnboardingChecklist({ items, total, completed }: OnboardingChecklistProps) {
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

  if (total === 0) return null;

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Onboarding Progress</h3>
          <span className="text-xs text-muted-foreground">
            {completed} of {total} done
          </span>
        </div>
        <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{
              width: `${total > 0 ? Math.round((completed / total) * 100) : 0}%`,
            }}
          />
        </div>
        {completed === total && (
          <div className="mb-3 rounded-md bg-[#E8F2EB] p-3 text-sm text-[#2D5C3A]">
            <CheckCircle2 className="mr-1.5 inline size-4" />
            Ready to start — all onboarding requirements addressed.
          </div>
        )}
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="flex items-center gap-3">
                {item.status === "completed" ? (
                  <CheckCircle2 className="size-4 shrink-0 text-[#4A8C5C]" />
                ) : item.status === "skipped" ? (
                  <MinusCircle className="size-4 shrink-0 text-muted-foreground/50" />
                ) : (
                  <Circle className="size-4 shrink-0 text-muted-foreground" />
                )}
                <div>
                  <p className={`text-sm font-medium ${item.status === "skipped" ? "text-muted-foreground/60 line-through" : ""}`}>
                    {item.credential_type?.name ?? "Credential"}
                  </p>
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
                      Skip
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
