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
import { MoreHorizontal, Pencil, Trash2, Search, CheckCircle2, AlertTriangle, ClipboardCheck } from "lucide-react";
import { formatDate } from "@/lib/utils/date";
import { formatRoleLabel, BUILT_IN_ROLES } from "@/lib/utils/roles";
import { deriveWorkStatus, hasPendingOnboardingItems, WORK_STATUS_META, WORK_STATUS_FILTER, type WorkStatus } from "@/lib/utils/work-status";
import type { OnboardingStaffState } from "@/lib/staff/onboarding";
import type { Tables } from "@/types/database";
import type { ReadinessResult } from "@/lib/staff/readiness";

type StaffMember = Tables<"staff_members">;

interface RoleOption {
  value: string;
  label: string;
}

const EMPTY_ONBOARDING_STATE: OnboardingStaffState = {
  requiredTotal: 0,
  requiredCompleted: 0,
  requiredPending: 0,
  optionalTotal: 0,
  optionalCompleted: 0,
  optionalPending: 0,
  missingNames: [],
};

const EMPTY_READINESS: ReadinessResult = {
  status: "pending",
  missingCredentials: [],
  expiredCredentials: [],
  expiringCredentials: [],
};

interface StaffTableProps {
  staff: StaffMember[];
  onDelete: (id: string) => void;
  readinessMap?: Record<string, ReadinessResult>;
  onboardingState?: Record<string, OnboardingStaffState>;
  dataUnavailable?: boolean;
  canEdit?: boolean;
  /** Role filter options (resolved templates: built-ins + clinic custom roles,
   * labels via formatRoleLabel). Falls back to the built-ins. */
  roleOptions?: RoleOption[];
}

function StatusIcon({ type }: { type: "check" | "alert" | "warning" }) {
  const labels: Record<string, string> = {
    check: "Work ready",
    alert: "In progress",
    warning: "Blocked",
  };
  return (
    <span aria-label={labels[type]} role="img">
      {type === "check" && <CheckCircle2 className="size-4 shrink-0 text-[#4A8C5C]" />}
      {type === "alert" && <AlertTriangle className="size-4 shrink-0 text-[#C2853A]" />}
      {type === "warning" && <AlertTriangle className="size-4 shrink-0 text-destructive" />}
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

export function StaffTable({ staff, onDelete, readinessMap = {}, onboardingState = {}, dataUnavailable = false, canEdit = true, roleOptions }: StaffTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<WorkStatus | "">("");

  const roleFilterOptions = useMemo(
    () => roleOptions ?? BUILT_IN_ROLES.map((key) => ({ value: key, label: formatRoleLabel(key) })),
    [roleOptions],
  );

  const filteredStaff = useMemo(() => {
    return staff.filter((member) => {
      if (search) {
        const q = search.toLowerCase();
        const nameMatch = member.name.toLowerCase().includes(q);
        const emailMatch = member.email?.toLowerCase().includes(q);
        if (!nameMatch && !emailMatch) return false;
      }
      if (roleFilter && member.role !== roleFilter) return false;
      if (statusFilter) {
        const readiness = readinessMap[member.id] ?? EMPTY_READINESS;
        const onboarding = onboardingState[member.id] ?? EMPTY_ONBOARDING_STATE;
        if (deriveWorkStatus(readiness, onboarding) !== statusFilter) return false;
      }
      return true;
    });
  }, [staff, search, roleFilter, statusFilter, readinessMap, onboardingState]);

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
      {dataUnavailable && (
        <div className="flex items-center gap-3 rounded-lg border border-muted-foreground/20 bg-muted/20 px-4 py-3">
          <AlertTriangle className="size-5 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Compliance data unavailable</p>
            <p className="text-xs text-muted-foreground">
              Work readiness could not be computed. Try refreshing to see staff statuses.
            </p>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Role:</span>
          <Button
            key="all"
            variant={roleFilter === "" ? "default" : "outline"}
            size="sm"
            onClick={() => setRoleFilter("")}
            className="h-7 text-xs"
          >
            All
          </Button>
          {roleFilterOptions.map((opt) => (
            <Button
              key={opt.value}
              variant={roleFilter === opt.value ? "default" : "outline"}
              size="sm"
              onClick={() => setRoleFilter(opt.value)}
              className="h-7 text-xs"
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Status:</span>
        {WORK_STATUS_FILTER.map((item) => (
          <Button
            key={item.value || "all-status"}
            variant={statusFilter === item.value ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(item.value)}
            className="h-7 text-xs"
          >
            {item.label}
          </Button>
        ))}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
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
              const readiness = readinessMap[member.id] ?? EMPTY_READINESS;
              const onboarding = onboardingState[member.id] ?? EMPTY_ONBOARDING_STATE;
              const status = deriveWorkStatus(readiness, onboarding);
              const meta = WORK_STATUS_META[status];
              // D2/D13 CTA rule: the button exists only when there is genuine
              // onboarding work — pending checklist items (Continue) or a
              // legacy employee with no items generated yet (Start). An
              // In-Progress employee whose only issue is a lapsed credential
              // gets no onboarding CTA; the Details column names the gap.
              const hasPendingItems = hasPendingOnboardingItems(onboarding);
              const showOnboardingCta =
                status !== "work_ready" && (hasPendingItems || readiness.status === "pending");
              const onboardingCtaLabel = hasPendingItems ? "Continue onboarding" : "Start onboarding";
              return (
                <TableRow
                  key={member.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/dashboard/staff/${member.id}`)}
                  onKeyDown={(e) => {
                    // Only navigate on Enter when the row itself is focused —
                    // a focused button inside (e.g. Continue onboarding) must
                    // not trigger the row's handler on the bubbling keydown.
                    if (e.key === "Enter" && e.target === e.currentTarget) {
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
                        {formatRoleLabel(member.role)}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${meta.color}`}>
                      <StatusIcon type={meta.icon} />
                      {meta.label}
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
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      {showOnboardingCta && (
                        <Button
                          variant={status === "blocked" ? "default" : "secondary"}
                          size="sm"
                          onClick={() => router.push(`/dashboard/staff/${member.id}#onboarding`)}
                          className="h-7 gap-1 text-xs"
                          aria-label={`${onboardingCtaLabel} for ${member.name}`}
                        >
                          <ClipboardCheck className="size-3.5" />
                          {onboardingCtaLabel}
                        </Button>
                      )}
                      {canEdit && (
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
                      )}
                    </div>
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
