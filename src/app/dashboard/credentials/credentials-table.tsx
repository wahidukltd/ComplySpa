"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate, daysUntil } from "@/lib/utils/date";
import { ExternalLink, Search, Trash2 } from "lucide-react";
import { verifyCredentialNow, deleteCredential } from "@/lib/actions/credentials";

interface CredentialRow {
  id: string;
  license_number: string | null;
  state: string | null;
  issue_date: string | null;
  expiration_date: string | null;
  status: string;
  verification_url: string | null;
  last_verified_date: string | null;
  document_url: string | null;
  notes: string | null;
  credential_type_id: string;
  staff_member_id: string;
  staff: { name: string } | null;
  credential_type: { name: string; category: string } | null;
}

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive"> = {
  valid: "default",
  expiring: "secondary",
  expired: "destructive",
};

const STATUS_LABELS: Record<string, string> = {
  valid: "Valid",
  expiring: "Expiring",
  expired: "Expired",
};

export function CredentialsTable({ credentials }: { credentials: CredentialRow[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filtered = credentials.filter((c) => {
    const matchesText =
      !filter ||
      c.staff?.name?.toLowerCase().includes(filter.toLowerCase()) ||
      c.credential_type?.name?.toLowerCase().includes(filter.toLowerCase()) ||
      (c.license_number ?? "").toLowerCase().includes(filter.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    return matchesText && matchesStatus;
  });

  if (credentials.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
        <p className="text-sm text-muted-foreground">
          No credentials yet. Add staff members and their credentials to start tracking.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3 xl:gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search by staff, type, or license number..."
            className="pl-8"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="valid">Valid</SelectItem>
            <SelectItem value="expiring">Expiring</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Staff</TableHead>
            <TableHead>Credential</TableHead>
            <TableHead>License #</TableHead>
            <TableHead>State</TableHead>
            <TableHead>Expiration</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((cred) => {
            const status = cred.status;
            return (
              <TableRow key={cred.id}>
                <TableCell className="font-medium">
                  <button
                    className="hover:underline"
                    onClick={() => router.push(`/dashboard/staff/${cred.staff_member_id}`)}
                  >
                    {cred.staff?.name ?? "—"}
                  </button>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {cred.credential_type?.name ?? "—"}
                </TableCell>
                <TableCell>{cred.license_number || "—"}</TableCell>
                <TableCell>{cred.state || "—"}</TableCell>
                <TableCell>
                  {cred.expiration_date
                    ? `${formatDate(cred.expiration_date)} (${daysUntil(cred.expiration_date)}d)`
                    : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANTS[status] ?? "outline"}>
                    {STATUS_LABELS[status]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    {cred.verification_url && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          window.open(cred.verification_url!, "_blank");
                          await verifyCredentialNow(cred.id);
                          router.refresh();
                        }}
                      >
                        <ExternalLink className="mr-1 size-3" />
                        Verify
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        if (confirm("Delete this credential? This action cannot be undone.")) {
                          await deleteCredential(cred.id, cred.staff_member_id);
                          router.refresh();
                        }
                      }}
                    >
                      <Trash2 className="size-3 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
