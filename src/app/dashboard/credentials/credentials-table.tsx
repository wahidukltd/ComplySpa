"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate, daysUntil } from "@/lib/utils/date";
import { ExternalLink, Search, Trash2, Paperclip, Eye, RefreshCw, Pencil, FolderPlus, ShieldPlus, X } from "lucide-react";
import { verifyCredentialNow, deleteCredential } from "@/lib/actions/credentials";
import { STATUS_LABELS, STATUS_VARIANTS, CATEGORY_COLORS } from "@/lib/utils/credential-display";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

const CATEGORIES = ["license", "training", "insurance", "agreement"] as const;

export function CredentialsTable({
  credentials,
  context,
  staffName,
  hasStaff,
  canEdit,
  addCredentialHref,
}: {
  credentials: CredentialRow[];
  context: "clinic" | "staff";
  staffName?: string;
  hasStaff: boolean;
  canEdit: boolean;
  addCredentialHref: string;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

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

  const counts = useMemo(
    () => ({
      total: credentials.length,
      valid: credentials.filter((c) => c.status === "valid").length,
      expiring: credentials.filter((c) => c.status === "expiring").length,
      expired: credentials.filter((c) => c.status === "expired").length,
    }),
    [credentials],
  );

  const clearFilters = () => {
    setFilter("");
    setStatusFilter("all");
    setCategoryFilter("all");
  };

  if (credentials.length === 0) {
    if (!hasStaff && context === "clinic") {
      return (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <FolderPlus className="size-10 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-semibold">No staff yet — create your first member</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Credentials are attached to staff members. Add your first staff member to start tracking
            their licenses, certifications, and renewals.
          </p>
          <Link href="/dashboard/staff" className={cn(buttonVariants({ variant: "default" }), "mt-5 gap-1.5")}>
            <FolderPlus className="size-4" />
            Create staff
          </Link>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
        <ShieldPlus className="size-10 text-muted-foreground" />
        <h2 className="mt-4 text-lg font-semibold">
          {context === "staff" && staffName ? `${staffName} has no credentials yet` : "No credentials yet"}
        </h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {context === "staff"
            ? "Track their licenses, certifications, and agreements here."
            : "Track your team's licenses, certifications, and agreements here."}
        </p>
        {canEdit && (
          <Link href={addCredentialHref} className={cn(buttonVariants({ variant: "default" }), "mt-5 gap-1.5")}>
            <ShieldPlus className="size-4" />
            Add credential
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { key: "all", label: "Total", count: counts.total, className: "bg-muted text-muted-foreground" },
            { key: "valid", label: STATUS_LABELS.valid, count: counts.valid, className: "bg-[#4A8C5C]/10 text-[#4A8C5C]" },
            { key: "expiring", label: STATUS_LABELS.expiring, count: counts.expiring, className: "bg-[#C2853A]/10 text-[#C2853A]" },
            { key: "expired", label: STATUS_LABELS.expired, count: counts.expired, className: "bg-destructive/10 text-destructive" },
          ] as const
        ).map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => setStatusFilter(chip.key)}
            aria-label={`Filter to ${chip.label} credentials`}
            aria-pressed={statusFilter === chip.key}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
              chip.className,
              statusFilter === chip.key && "ring-1 ring-foreground/30",
            )}
          >
            {chip.label} {chip.count}
          </button>
        ))}
      </div>

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
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </SelectItem>
              ))}
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
          <p className="text-sm text-muted-foreground">No credentials match your filters.</p>
          <Button variant="outline" size="sm" onClick={clearFilters} className="mt-3 gap-1.5">
            <X className="size-3" />
            Clear filters
          </Button>
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
              <TableHead className="w-[160px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((cred) => {
              const staffLabel = cred.staff?.name ?? "Staff member";
              const typeLabel = cred.credential_type?.name ?? "Credential";
              return (
                <TableRow
                  key={cred.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/dashboard/credentials/${cred.id}`)}
                  onKeyDown={(e) => {
                    // Only the row itself navigates; keydowns bubbling from the
                    // nested action buttons must not double-trigger them.
                    if (e.key === "Enter" && e.target === e.currentTarget) {
                      router.push(`/dashboard/credentials/${cred.id}`);
                    }
                  }}
                  tabIndex={0}
                  role="link"
                >
                  <TableCell className="font-medium">
                    <Link
                      href={`/dashboard/staff/${cred.staff_member_id}`}
                      className="hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {cred.staff?.name ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span>{typeLabel}</span>
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
                    <Badge variant={STATUS_VARIANTS[cred.status] ?? "outline"}>
                      {STATUS_LABELS[cred.status] ?? cred.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`View ${typeLabel} for ${staffLabel}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/dashboard/credentials/${cred.id}`);
                        }}
                      >
                        <Eye className="size-3" />
                      </Button>
                      {canEdit && (cred.status === "expiring" || cred.status === "expired") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Renew ${typeLabel} for ${staffLabel}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/dashboard/credentials/${cred.id}/renew`);
                          }}
                        >
                          <RefreshCw className="size-3" />
                        </Button>
                      )}
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Edit ${typeLabel} for ${staffLabel}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/dashboard/staff/${cred.staff_member_id}/credentials/${cred.id}/edit`);
                          }}
                        >
                          <Pencil className="size-3" />
                        </Button>
                      )}
                      {canEdit && cred.verification_url && (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Verify ${typeLabel} for ${staffLabel}`}
                          disabled={busyId === cred.id}
                          onClick={async (e) => {
                            e.stopPropagation();
                            setBusyId(cred.id);
                            try {
                              window.open(cred.verification_url!, "_blank");
                              const result = await verifyCredentialNow(cred.id);
                              if (result.error) {
                                toast.error(result.error);
                              } else {
                                toast.success("Credential verified");
                                router.refresh();
                              }
                            } finally {
                              setBusyId(null);
                            }
                          }}
                        >
                          <ExternalLink className="size-3" />
                        </Button>
                      )}
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Delete ${typeLabel} for ${staffLabel}`}
                          disabled={busyId === cred.id}
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!confirm("Delete this credential? This action cannot be undone.")) return;
                            setBusyId(cred.id);
                            try {
                              const result = await deleteCredential(cred.id, cred.staff_member_id);
                              if (result.error) {
                                toast.error(result.error);
                              } else {
                                toast.success("Credential deleted");
                                router.refresh();
                              }
                            } finally {
                              setBusyId(null);
                            }
                          }}
                        >
                          <Trash2 className="size-3 text-destructive" />
                        </Button>
                      )}
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
