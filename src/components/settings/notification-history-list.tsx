"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DeliveryStatusBadge } from "@/components/alerts/delivery-status-badge";
import { formatDateTime, formatRelativeTime } from "@/lib/utils/date";
import { Mail, Search } from "lucide-react";
import { PENDING_DETAIL_LABEL, type NotificationKind } from "@/lib/utils/notification-history";

export interface NotificationRow {
  id: string;
  kind: NotificationKind;
  typeLabel: string;
  credentialLabel: string | null;
  recipient: string;
  sentAt: string;
  deliveredAt: string | null;
  deliveryStatus: "delivered" | "failed" | "pending";
  failureDetail: string | null;
}

export interface NotificationSummary {
  delivered: number;
  failed: number;
  pending: number;
}

type StatusFilter = "" | "delivered" | "failed" | "pending";
type KindFilter = "" | NotificationKind;

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "", label: "All" },
  { value: "delivered", label: "Delivered" },
  { value: "failed", label: "Failed" },
  { value: "pending", label: "Awaiting" },
];

const KIND_FILTERS: { value: KindFilter; label: string }[] = [
  { value: "", label: "All types" },
  { value: "expiration", label: "Expiration" },
  { value: "escalation", label: "Escalation" },
];

function isStatusFilter(value: string | null): value is StatusFilter {
  return value === "delivered" || value === "failed" || value === "pending";
}

export function NotificationHistoryList({ rows, summary }: { rows: NotificationRow[]; summary: NotificationSummary }) {
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get("status");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    isStatusFilter(initialStatus) ? initialStatus : "",
  );
  const [kindFilter, setKindFilter] = useState<KindFilter>("");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (statusFilter && row.deliveryStatus !== statusFilter) return false;
      if (kindFilter && row.kind !== kindFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!row.recipient.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, statusFilter, kindFilter, search]);

  const hasFilters = statusFilter !== "" || kindFilter !== "" || search !== "";
  const hasAny = rows.length > 0;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {summary.delivered} delivered · {summary.failed} failed · {summary.pending} awaiting confirmation
      </p>

      <div className="flex flex-col gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search by recipient..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
            aria-label="Search notifications by recipient"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Status:</span>
          {STATUS_FILTERS.map((item) => (
            <Button
              key={item.value || "all-status"}
              variant={statusFilter === item.value ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(item.value)}
              className="h-7 text-xs"
              aria-pressed={statusFilter === item.value}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Type:</span>
          {KIND_FILTERS.map((item) => (
            <Button
              key={item.value || "all-kind"}
              variant={kindFilter === item.value ? "default" : "outline"}
              size="sm"
              onClick={() => setKindFilter(item.value)}
              className="h-7 text-xs"
              aria-pressed={kindFilter === item.value}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </div>

      {!hasAny ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <p className="text-sm text-muted-foreground">
            No notifications recorded yet — reminders are logged automatically as credentials near expiration.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <p className="text-sm text-muted-foreground">No notifications match your filters.</p>
          {hasFilters && (
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => { setStatusFilter(""); setKindFilter(""); setSearch(""); }}>
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Credential</TableHead>
              <TableHead>Recipient</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Failure detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((row) => (
              <TableRow key={row.id} className={row.deliveryStatus === "failed" ? "bg-destructive/5" : undefined}>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Mail className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="text-sm">{row.typeLabel}</span>
                  </div>
                </TableCell>
                <TableCell className="max-w-[220px] truncate text-sm" title={row.credentialLabel ?? undefined}>
                  {row.credentialLabel ?? <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="max-w-[200px] truncate text-sm">{row.recipient}</TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {row.deliveryStatus === "delivered" && row.deliveredAt ? (
                    <time dateTime={row.deliveredAt} title={formatDateTime(row.deliveredAt)}>
                      Delivered {formatRelativeTime(row.deliveredAt)}
                    </time>
                  ) : (
                    <time dateTime={row.sentAt} title={formatDateTime(row.sentAt)}>
                      {formatRelativeTime(row.sentAt)}
                    </time>
                  )}
                </TableCell>
                <TableCell>
                  <DeliveryStatusBadge status={row.deliveryStatus} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {row.deliveryStatus === "failed"
                    ? (row.failureDetail ?? <span className="text-muted-foreground">—</span>)
                    : row.deliveryStatus === "pending"
                      ? PENDING_DETAIL_LABEL
                      : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
