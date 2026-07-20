import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Clock } from "lucide-react";

type DeliveryStatus = "delivered" | "failed" | "pending";

interface DeliveryStatusBadgeProps {
  status: DeliveryStatus;
}

export function DeliveryStatusBadge({ status }: DeliveryStatusBadgeProps) {
  switch (status) {
    case "delivered":
      return (
        <Badge variant="default" className="gap-1">
          <CheckCircle className="size-3" />
          Delivered
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="size-3" />
          Failed
        </Badge>
      );
    case "pending":
    default:
      return (
        <Badge variant="secondary" className="gap-1">
          <Clock className="size-3" />
          Pending
        </Badge>
      );
  }
}
