"use client";

import { CHECKLIST_ITEMS } from "@/lib/audit/checklist";
import { updateFinding } from "@/lib/actions/audit";
import { Button } from "@/components/ui/button";
import type { FindingStatus, AuditFinding } from "@/lib/audit/checklist";
import { useState } from "react";

interface Props {
  findings: AuditFinding[];
  auditStatus: string;
}

const STATUS_BADGE: Record<FindingStatus, { bg: string; text: string; icon: string; label: string }> = {
  pass: { bg: "#E8F2EB", text: "#2D5C3A", icon: "✓", label: "Pass" },
  fail: { bg: "#FCE8E5", text: "#7A2A26", icon: "✕", label: "Fail" },
  stale: { bg: "#FBF0E0", text: "#7A4E1F", icon: "▲", label: "Stale" },
  manual_attest: { bg: "#F2EFED", text: "#5A504C", icon: "—", label: "Confirm" },
};

export function AuditChecklist({ findings, auditStatus }: Props) {
  const [updating, setUpdating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async (findingId: string, passed: boolean) => {
    setUpdating(findingId);
    setError(null);
    try {
      const result = await updateFinding(findingId, {
        status: passed ? "pass" : "fail",
        notes: passed ? "Confirmed present and current." : "Marked as not ready.",
      });
      if (result.error) {
        setError(result.error);
      }
    } catch {
      setError("Failed to update. Please try again.");
    } finally {
      setUpdating(null);
    }
  };

  const isReadOnly = auditStatus === "completed";

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-sm" style={{ color: "#B8443A" }}>{error}</p>
      )}
      {CHECKLIST_ITEMS.map((item) => {
        const finding = findings.find((f) => f.checklistItem === item.id);
        if (!finding) return null;

        const badge = STATUS_BADGE[finding.status];

        return (
          <div
            key={item.id}
            className="rounded-lg border p-4"
            style={{ borderColor: "#D9B7A7" }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium text-sm" style={{ color: "#3D2A25" }}>
                    {item.label}
                  </h4>
                  {finding.autoFilled && (
                    <span
                      className="text-xs px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: "#F6E3D6", color: "#8B7D78" }}
                    >
                      auto
                    </span>
                  )}
                  <span
                    className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ backgroundColor: badge.bg, color: badge.text }}
                  >
                    {badge.icon} {badge.label}
                  </span>
                </div>
                <p className="text-xs" style={{ color: "#8B7D78" }}>
                  {item.description}
                </p>
                {finding.notes && (
                  <p className="text-xs mt-1 italic" style={{ color: "#8B7D78" }}>
                    {finding.notes}
                  </p>
                )}
              </div>

              {finding.status === "manual_attest" && !isReadOnly && (
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={updating === finding.id}
                    onClick={() => handleConfirm(finding.id, true)}
                    style={{ borderColor: "#4A8C5C", color: "#4A8C5C" }}
                  >
                    Confirm
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={updating === finding.id}
                    onClick={() => handleConfirm(finding.id, false)}
                    style={{ borderColor: "#B8443A", color: "#B8443A" }}
                  >
                    Not Ready
                  </Button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
