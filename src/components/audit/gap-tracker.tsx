"use client";

import { updateFinding } from "@/lib/actions/audit";
import { CHECKLIST_ITEMS } from "@/lib/audit/checklist";
import type { AuditFinding } from "@/lib/audit/checklist";
import { useState } from "react";

interface Props {
  findings: AuditFinding[];
  auditStatus: string;
}

export function GapTracker({ findings, auditStatus }: Props) {
  const gaps = findings.filter((f) => f.status === "fail" || f.status === "stale");
  const isReadOnly = auditStatus === "completed";

  if (gaps.length === 0) {
    return (
      <div className="rounded-lg border p-6 text-center" style={{ borderColor: "#D9B7A7" }}>
        <p className="text-sm" style={{ color: "#8B7D78" }}>
          No gaps found. All items passed or confirmed.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "#D9B7A7" }}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b" style={{ borderColor: "#D9B7A7", backgroundColor: "#F6E3D6" }}>
            <th className="py-2 px-3 text-left font-medium" style={{ color: "#3D2A25" }}>Item</th>
            <th className="py-2 px-3 text-left font-medium" style={{ color: "#3D2A25" }}>Status</th>
            <th className="py-2 px-3 text-left font-medium" style={{ color: "#3D2A25" }}>Notes</th>
            <th className="py-2 px-3 text-left font-medium" style={{ color: "#3D2A25" }}>Due Date</th>
            <th className="py-2 px-3 text-left font-medium" style={{ color: "#3D2A25" }}>Remediation</th>
          </tr>
        </thead>
        <tbody>
          {gaps.map((g) => {
            const label = CHECKLIST_ITEMS.find((i) => i.id === g.checklistItem)?.label ?? g.checklistItem;
            return (
              <tr key={g.id} className="border-b" style={{ borderColor: "#F6E3D6" }}>
                <td className="py-2 px-3" style={{ color: "#3D2A25" }}>{label}</td>
                <td className="py-2 px-3">
                  <span
                    className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                    style={{
                      backgroundColor: g.status === "fail" ? "#FCE8E5" : "#FBF0E0",
                      color: g.status === "fail" ? "#7A2A26" : "#7A4E1F",
                    }}
                  >
                    {g.status === "fail" ? "Fail" : "Stale"}
                  </span>
                </td>
                <td className="py-2 px-3 text-xs" style={{ color: "#8B7D78" }}>{g.notes ?? "—"}</td>
                <td className="py-2 px-3">
                  <DateCell finding={g} readonly={isReadOnly} />
                </td>
                <td className="py-2 px-3">
                  <RemediationCell finding={g} readonly={isReadOnly} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RemediationCell({
  finding,
  readonly,
}: {
  finding: AuditFinding;
  readonly: boolean;
}) {
  const [status, setStatus] = useState(finding.remediationStatus ?? "open");

  if (readonly) {
    return (
      <span className="text-xs" style={{ color: "#8B7D78" }}>
        {finding.remediationStatus ?? "—"}
      </span>
    );
  }

  const handleChange = async (newStatus: string) => {
    setStatus(newStatus);
    await updateFinding(finding.id, {
      remediation_status: newStatus as "open" | "in_progress" | "closed",
    });
  };

  return (
    <select
      value={status}
      onChange={(e) => handleChange(e.target.value)}
      className="text-xs border rounded px-2 py-1"
      style={{ borderColor: "#D9B7A7", color: "#3D2A25" }}
    >
      <option value="open">Open</option>
      <option value="in_progress">In Progress</option>
      <option value="closed">Closed</option>
    </select>
  );
}

function DateCell({
  finding,
  readonly,
}: {
  finding: AuditFinding;
  readonly: boolean;
}) {
  const [dueDate, setDueDate] = useState(finding.remediationDueDate ?? "");

  if (readonly) {
    return (
      <span className="text-xs" style={{ color: "#8B7D78" }}>
        {finding.remediationDueDate
          ? new Date(finding.remediationDueDate).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })
          : "—"}
      </span>
    );
  }

  const handleBlur = async () => {
    if (dueDate !== (finding.remediationDueDate ?? "")) {
      await updateFinding(finding.id, {
        remediation_due_date: dueDate || null,
      });
    }
  };

  return (
    <input
      type="date"
      value={dueDate}
      onChange={(e) => setDueDate(e.target.value)}
      onBlur={handleBlur}
      className="text-xs border rounded px-2 py-1 w-32"
      style={{ borderColor: "#D9B7A7", color: "#3D2A25" }}
    />
  );
}
