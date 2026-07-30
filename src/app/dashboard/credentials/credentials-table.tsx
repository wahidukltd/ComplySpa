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
import { ExternalLink, Search, Trash2, Paperclip, Eye, RefreshCw } from "lucide-react";
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

const CATEGORY_COLORS: Record<string, string> = {
  license: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  training: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  insurance: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  agreement: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

export function CredentialsTable({ credentials }: { credentials: CredentialRow[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const filtered = credentials.filter((c) => {
    const matchesText =
      !filter ||
      c.staff?.name?.toLowerCase().includes(filter.toLowerCase()) ||
      c.credential_type?.name?.toLowerCase().includes(filter.toLowerCase()) ||
      (c.license_number ?? "").toLowerCase().includes(filter.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    const matchesCategory = categoryFilter === "all" || c.credential_type?.category === categoryFilter;
    return matchesText && matchesStatus && matchesCategory;
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
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search by staff, type, or number..."
            className="pl-8"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <div className="flex gap-3">
          <Select value={categoryFilter} onValueChange={(v) => v && setCategoryFilter(v)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="license">License</SelectItem>
              <SelectItem value="training">Training</SelectItem>
              <SelectItem value="insurance">Insurance</SelectItem>
              <SelectItem value="agreement">Agreement</SelectItem>
            </SelectContent>
          </Select>
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
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No credentials match your filters.
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Staff</TableHead>
              <TableHead>Credential</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Number / ID</TableHead>
              <TableHead>Expiration</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((cred) => {
              const status = cred.status;
              return (
                <TableRow
                  key={cred.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/dashboard/credentials/${cred.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      router.push(`/dashboard/credentials/${cred.id}`);
                    }
                  }}
                  tabIndex={0}
                  role="link"
                >
                  <TableCell className="font-medium">
                    <span className="hover:underline">
                      {cred.staff?.name ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span>{cred.credential_type?.name ?? "—"}</span>
                      {cred.document_url && (
                        <Paperclip className="size-3 shrink-0 text-muted-foreground" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {cred.credential_type?.category ? (
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          CATEGORY_COLORS[cred.credential_type.category] ?? "bg-muted text-muted-foreground"
                        }`}
                      >
                        {cred.credential_type.category}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {cred.license_number || "—"}
                  </TableCell>
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
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/dashboard/credentials/${cred.id}`);
                        }}
                      >
                        <Eye className="size-3" />
                      </Button>
                      {(cred.status === "expiring" || cred.status === "expired") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/dashboard/credentials/${cred.id}/renew`);
                          }}
                        >
                          <RefreshCw className="size-3" />
                        </Button>
                      )}
                      {cred.verification_url && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async (e) => {
                            e.stopPropagation();
                            window.open(cred.verification_url!, "_blank");
                            await verifyCredentialNow(cred.id);
                            router.refresh();
                          }}
                        >
                          <ExternalLink className="size-3" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async (e) => {
                          e.stopPropagation();
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
      )}
    </div>
  );
}
