"use client";

import { useState, useMemo } from "react";
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2, Search, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { formatDate } from "@/lib/utils/date";
import { ROLE_DISPLAY_LABELS, ROLE_VALUES } from "@/lib/staff/role-credential-defaults";
import type { Tables } from "@/types/database";
import type { ReadinessResult } from "@/lib/staff/readiness";

type StaffMember = Tables<"staff_members">;

const READINESS_STYLES: Record<string, { color: string; label: string; icon: "check" | "alert" | "warning" | "info" } | undefined> = {
  ready: { color: "text-[#4A8C5C]", label: "Ready", icon: "check" },
  at_risk: { color: "text-[#C2853A]", label: "At Risk", icon: "alert" },
  non_compliant: { color: "text-destructive font-semibold", label: "Non-Compliant", icon: "warning" },
  pending: { color: "text-muted-foreground", label: "Pending", icon: "info" },
};

const ROLE_KEYS = ["", ...ROLE_VALUES] as const;

interface StaffTableProps {
  staff: StaffMember[];
  onDelete: (id: string) => void;
  readinessMap?: Record<string, ReadinessResult>;
}

function ReadinessIcon({ type }: { type: "check" | "alert" | "warning" | "info" }) {
  const labels: Record<string, string> = {
    check: "Ready",
    alert: "At risk",
    warning: "Non-compliant",
    info: "Pending",
  };
  return (
    <span aria-label={labels[type]} role="img">
      {type === "check" && <CheckCircle2 className="size-4 shrink-0 text-[#4A8C5C]" />}
      {type === "alert" && <AlertTriangle className="size-4 shrink-0 text-[#C2853A]" />}
      {type === "warning" && <AlertTriangle className="size-4 shrink-0 text-destructive" />}
      {type === "info" && <Info className="size-4 shrink-0 text-muted-foreground" />}
    </span>
  );
}

function formatReadinessDetails(r: ReadinessResult): string {
  const parts: string[] = [];
  if (r.missingCredentials.length > 0) {
    parts.push(`Missing: ${r.missingCredentials.map((m) => m.name).join(", ")}`);
  }
  if (r.expiredCredentials.length > 0) {
    parts.push(`Expired: ${r.expiredCredentials.map((e) => e.name).join(", ")}`);
  }
  if (r.expiringCredentials.length > 0) {
    parts.push(`Expiring: ${r.expiringCredentials.map((e) => e.name).join(", ")}`);
  }
  return parts.join(" · ");
}

export function StaffTable({ staff, onDelete, readinessMap = {} }: StaffTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  const filteredStaff = useMemo(() => {
    return staff.filter((member) => {
      if (search) {
        const q = search.toLowerCase();
        const nameMatch = member.name.toLowerCase().includes(q);
        const emailMatch = member.email?.toLowerCase().includes(q);
        if (!nameMatch && !emailMatch) return false;
      }
      if (roleFilter && member.role !== roleFilter) return false;
      return true;
    });
  }, [staff, search, roleFilter]);

  if (staff.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
        <p className="text-sm text-muted-foreground">
          No staff members yet. Add your first staff member to start tracking credentials.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ROLE_KEYS.map((key) => {
            const label = key === "" ? "All" : (ROLE_DISPLAY_LABELS[key] ?? key);
            return (
              <Button
                key={key || "all"}
                variant={roleFilter === key ? "default" : "outline"}
                size="sm"
                onClick={() => setRoleFilter(key)}
                className="h-7 text-xs"
              >
                {label}
              </Button>
            );
          })}
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Readiness</TableHead>
            <TableHead>Details</TableHead>
            <TableHead>Hire Date</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredStaff.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                No staff match your search or filters.
              </TableCell>
            </TableRow>
          ) : (
            filteredStaff.map((member) => {
              const rStatus: keyof typeof READINESS_STYLES = readinessMap[member.id]?.status ?? "pending";
              const rStyle = READINESS_STYLES[rStatus]!;
              return (
                <TableRow
                  key={member.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/dashboard/staff/${member.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      router.push(`/dashboard/staff/${member.id}`);
                    }
                  }}
                  tabIndex={0}
                  role="link"
                >
                  <TableCell className="font-medium">{member.name}</TableCell>
                  <TableCell>
                    {member.role ? (
                      <Badge variant="secondary">
                        {ROLE_DISPLAY_LABELS[member.role] ?? member.role}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${rStyle.color}`}>
                      <ReadinessIcon type={rStyle.icon} />
                      {rStyle.label}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={readinessMap[member.id] ? formatReadinessDetails(readinessMap[member.id]!) : ""}>
                    {readinessMap[member.id] ? formatReadinessDetails(readinessMap[member.id]!) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(member.hire_date) || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {member.email || "—"}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Actions"
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/dashboard/staff/${member.id}/edit`);
                          }}
                        >
                          <Pencil className="mr-2 size-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(member.id);
                          }}
                        >
                          <Trash2 className="mr-2 size-4" />
                          Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
