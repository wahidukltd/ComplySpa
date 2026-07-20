import { Check, X, Clock } from "lucide-react";

interface DeliveryStatusBadgeProps {
  status: string;
}

export function DeliveryStatusBadge({ status }: DeliveryStatusBadgeProps) {
  if (status === "delivered") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#E8F2EB] px-2 py-0.5 text-xs font-medium text-[#2D5C3A]">
        <Check className="size-3" />
        Delivered
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
        <X className="size-3" />
        Failed
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
      <Clock className="size-3" />
      Pending
    </span>
  );
}
