"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ROLE_DISPLAY_LABELS, ROLE_VALUES } from "@/lib/staff/role-credential-defaults";
import { Search, ArrowRight } from "lucide-react";

interface StaffMember {
  id: string;
  name: string;
  role: string | null;
}

interface StaffProgress {
  total: number; completed: number; pending: number; skipped: number;
  requiredTotal: number; requiredCompleted: number;
  optionalTotal: number; optionalCompleted: number;
  blocked: boolean; missingNames: string[];
}

export function OnboardingList({
  staffList,
}: {
  staffList: (StaffMember & { progress: StaffProgress })[];
}) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  const filtered = useMemo(() => {
    return staffList.filter((member) => {
      if (search) {
        const q = search.toLowerCase();
        if (!member.name.toLowerCase().includes(q)) return false;
      }
      if (roleFilter && member.role !== roleFilter) return false;
      return true;
    });
  }, [staffList, search, roleFilter]);

  function formatMissing(names: string[]): string {
    if (names.length === 0) return "";
    const items = names.map((n) => `❌ ${n}`);
    if (items.length <= 3) return items.join(", ");
    return items.slice(0, 3).join(", ") + ` +${items.length - 3} more`;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button
            key="all"
            variant={roleFilter === "" ? "default" : "outline"}
            size="sm"
            onClick={() => setRoleFilter("")}
            className="h-7 text-xs"
          >
            All
          </Button>
          {ROLE_VALUES.map((key) => (
            <Button
              key={key}
              variant={roleFilter === key ? "default" : "outline"}
              size="sm"
              onClick={() => setRoleFilter(key)}
              className="h-7 text-xs"
            >
              {ROLE_DISPLAY_LABELS[key] ?? key}
            </Button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <p className="text-sm text-muted-foreground">
            No staff match your search or filters.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((member) => {
            const pct =
              member.progress.requiredTotal > 0
                ? Math.round((member.progress.requiredCompleted / member.progress.requiredTotal) * 100)
                : 0;
            return (
              <Link
                key={member.id}
                href={`/dashboard/staff/${member.id}`}
                className="block rounded-lg border p-4 hover:bg-muted/50"
              >
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{member.name}</p>
                      <Badge
                        variant={
                          member.progress.requiredTotal === 0
                            ? "outline"
                            : !member.progress.blocked
                              ? "default"
                              : member.progress.requiredCompleted > 0
                                ? "secondary"
                                : "destructive"
                        }
                        className="text-xs"
                      >
                        {member.progress.requiredTotal === 0
                          ? "Pending"
                          : !member.progress.blocked
                            ? "Ready"
                            : member.progress.requiredCompleted > 0
                              ? `${pct}%`
                              : "Blocked"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {member.role ? (ROLE_DISPLAY_LABELS[member.role] ?? member.role) : "No role"}
                    </p>
                    {member.progress.blocked && member.progress.missingNames.length > 0 && (
                      <p className="text-xs text-destructive">
                        {formatMissing(member.progress.missingNames)}
                      </p>
                    )}
                    {!member.progress.blocked && member.progress.requiredTotal > 0 && (
                      <p className="text-xs text-[#4A8C5C]">
                        ✓ All required items complete
                        {member.progress.optionalTotal > 0 && member.progress.optionalCompleted < member.progress.optionalTotal && (
                          <span className="text-muted-foreground">
                            {" "}({member.progress.optionalCompleted}/{member.progress.optionalTotal} optional)
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-20 overflow-hidden rounded-full bg-muted sm:w-28">
                        <div
                          className={`h-full rounded-full ${
                            member.progress.requiredTotal === 0
                              ? "bg-muted-foreground/20"
                              : !member.progress.blocked
                                ? "bg-[#4A8C5C]"
                                : "bg-[#C2853A]"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {member.progress.requiredTotal > 0
                          ? `${member.progress.requiredCompleted}/${member.progress.requiredTotal}`
                          : "—"}
                      </span>
                    </div>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
