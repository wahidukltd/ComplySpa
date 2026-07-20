"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DeliveryStatusBadge } from "@/components/alerts/delivery-status-badge";
import { formatDateTime } from "@/lib/utils/date";
import { Mail, Phone } from "lucide-react";
import type { Tables } from "@/types/database";

type AlertLog = Tables<"alert_logs">;

interface AlertListProps {
  alerts: AlertLog[];
}

export function AlertList({ alerts }: AlertListProps) {
  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
        <p className="text-sm text-muted-foreground">
          No alerts sent yet. Alerts are generated automatically when credentials near expiration.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Sent</TableHead>
          <TableHead>Channel</TableHead>
          <TableHead>Recipient</TableHead>
          <TableHead>Days before</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {alerts.map((alert) => (
          <TableRow key={alert.id}>
            <TableCell className="whitespace-nowrap text-muted-foreground">
              {formatDateTime(alert.sent_at)}
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1.5">
                {alert.alert_type === "email" ? (
                  <Mail className="size-3.5 text-muted-foreground" />
                ) : (
                  <Phone className="size-3.5 text-muted-foreground" />
                )}
                <span className="text-xs capitalize">{alert.alert_type}</span>
              </div>
            </TableCell>
            <TableCell className="max-w-[200px] truncate text-sm">
              {alert.recipient}
            </TableCell>
            <TableCell>
              <Badge variant={alert.days_before_expiration <= 7 ? "destructive" : "secondary"}>
                {alert.days_before_expiration < 0
                  ? `Expired ${Math.abs(alert.days_before_expiration)}d ago`
                  : `${alert.days_before_expiration}d`}
              </Badge>
            </TableCell>
            <TableCell>
              <DeliveryStatusBadge status={alert.delivery_status as "delivered" | "failed" | "pending"} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
