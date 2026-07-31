"use client";

import { useState } from "react";
import { ActionCard } from "./action-card";
import type { ComplianceAction } from "@/lib/staff/compliance-actions";

const GROUP_LABELS: Record<string, { title: string; limit: number }> = {
  critical: { title: "Critical", limit: 10 },
  warning: { title: "Warning", limit: 10 },
  info: { title: "Recommendations", limit: 10 },
};

const URGENCY_ORDER = ["critical", "warning", "info"];

export function ActionList({ actions, canVerify = true }: { actions: ComplianceAction[]; canVerify?: boolean }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const grouped: Record<string, ComplianceAction[]> = {};
  for (const a of actions) {
    const key = a.urgency;
    if (!grouped[key]) grouped[key] = [];
    grouped[key]!.push(a);
  }

  if (actions.length === 0) return null;

  return (
    <div className="space-y-6">
      {URGENCY_ORDER.map((urgency) => {
        const items = grouped[urgency] ?? [];
        if (items.length === 0) return null;

        const group = GROUP_LABELS[urgency] ?? { title: urgency, limit: 10 };
        const isExpanded = expanded[urgency] ?? false;
        const visible = isExpanded ? items : items.slice(0, group.limit);
        const remaining = items.length - group.limit;
        const controlsId = `action-group-${urgency}`;

        return (
          <div key={urgency}>
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              {group.title} ({items.length})
            </h2>
            <div className="space-y-2" id={controlsId}>
              {visible.map((action) => (
                <ActionCard key={action.id} action={action} canVerify={canVerify} />
              ))}
            </div>
            {remaining > 0 && (
              <button
                type="button"
                onClick={() => setExpanded((prev) => ({ ...prev, [urgency]: !prev[urgency] }))}
                aria-expanded={isExpanded}
                aria-controls={controlsId}
                className="mt-2 text-xs text-muted-foreground hover:text-foreground"
              >
                {isExpanded ? "Show less" : `+${remaining} more`}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
